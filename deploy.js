#!/usr/bin/env node
const execSync = require("child_process").execSync;
const fs = require("fs");
const shortid = require("shortid");

let args = process.argv.slice(2);
const env = args[0] || "dev";
const tenant = args[1] || "518f6460-1f14-4d4e-8b23-cc5871634f80";

const LOCAL_ASSET_PATHS = "annabels/* george-club/* marks-club/* harrys-bar/*";

const META_FOLDER = "metadata/"
const FILE_S3_BUCKET = `stackcrafters-sc-web-assets-${env}`;
const S3_PATH_PREFIX = `${tenant}/`;
const S3_DEPLOYED_REV_KEY = `${S3_PATH_PREFIX}deployed-rev`;
const DATA_S3_BUCKET = `stackcrafters-sc-web-data-${env}`;
const DATA_DEST_PATH = `${S3_PATH_PREFIX}`;

const recursivelyReplaceValues = (obj, replacements) => {
  Object.values(obj).forEach((v) => {
    if (v && Array.isArray(v)) {
      v.forEach((o) => recursivelyReplaceValues(o, replacements));
    } else if (v && typeof v === "object") {
      recursivelyReplaceValues(v, replacements);
    }
  });
  ['href', 'img', 'src', 'apple-touch-icon', 'favicon'].forEach((prop) => {
    if (obj[prop] && Object.keys(replacements).indexOf(obj[prop]) > -1) {
      obj[prop] = `${replacements[obj[prop]]}`;
    }
  });
  //add object key if missing
  if (!obj.key && obj.type) {
    let c = false;
    if (obj.components) {
      c = obj.components;
      delete obj.components;
    }
    obj.key = shortid.generate();
    if (c) {
      obj.components = c;
    }
  }
};

let deployedRev;
execSync(
    `aws s3api head-object --bucket ${FILE_S3_BUCKET} --key ${S3_DEPLOYED_REV_KEY} --debug || exit 0`
    , {stdio: 'inherit'}
);
let res = execSync(
  `aws s3api head-object --bucket ${FILE_S3_BUCKET} --key ${S3_DEPLOYED_REV_KEY} || exit 0`
);
if (res.length > 0) {
  execSync(
    `aws s3 cp s3://${FILE_S3_BUCKET}/${S3_DEPLOYED_REV_KEY} deployed-rev`
  ); //, {stdio: 'inherit'}
  deployedRev = fs.readFileSync("deployed-rev").toString().trim();
  if (execSync("git rev-parse HEAD").toString().trim() === deployedRev) {
    console.log("up to date");
    process.exit(0);
  }
  console.log(`updating deployment ${deployedRev}`);
} else {
  deployedRev = execSync("git rev-list HEAD | tail -n 1").toString().trim();
  console.log(`updating, no previous deployment (${deployedRev})`);
}

const fileDiffStr = execSync(
  `git diff --diff-filter=MACRT --name-only ${deployedRev} HEAD | grep -E "\\\\.(jpg|png|pdf|ico)$" || echo ''`
)
  .toString()
  .trim();
const metaDiffStr = execSync(
  `git diff --diff-filter=MACRT --name-only ${deployedRev} HEAD | grep "${META_FOLDER}" || echo ''`
)
  .toString()
  .trim();
if (metaDiffStr.length === 0 && fileDiffStr.length === 0) {
  console.log("no changes found to deploy");
  process.exit(0);
}

const fileHashLookup = {};
const allAssetFiles = execSync(
  `find ${LOCAL_ASSET_PATHS} -regextype egrep -regex ".*\\\\.(jpg|png|pdf|ico)"`
).toString();
// console.log('allAssetFiles', allAssetFiles)
allAssetFiles
  .trim()
  .split("\n")
  .forEach((f) => {
    fileHashLookup[f] = execSync(`git hash-object ${f} | cut -c1-7`)
      .toString()
      .trim();
  });
// console.log('fileHashLookup', fileHashLookup)

if (fileDiffStr.length > 0) {
  const fileDestLookup = Object.entries(fileHashLookup).reduce(
    (acc, [f, h]) => {
      const file = /(.*)\.(.*)$/.exec(f);
      acc[f] = `${S3_PATH_PREFIX}${file[1]}.${h}.${file[2]}`;
      return acc;
    },
    {}
  );
  // console.log('fileDestLookup', fileDestLookup)

  //copy changed files to s3
    fileDiffStr
        .trim()
        .split("\n")
        .forEach((f) => {
          if(fileDestLookup[f]) {
            execSync(
              `aws s3 cp ${f} s3://${FILE_S3_BUCKET}/${fileDestLookup[f]} --metadata-directive REPLACE --cache-control public,max-age=31536000,immutable`,
              {stdio: "inherit"}
            );
          }
          else{
            console.warn('No destination found for', f);
          }
        });
} else {
  console.log("no changed assets, skipping asset s3 sync");
}

const fileSubLookup = Object.entries(fileHashLookup).reduce((acc, [f, h]) => {
  const file = /(.*)\.(.*)$/.exec(f);
  acc[`/_assets/${f}`] = `/_assets/${file[1]}.${h}.${file[2]}`;
  return acc;
}, {});
// console.log(fileSubLookup);

let metaFiles = execSync(`ls ${META_FOLDER}`).toString().trim().split('\n');

let tmpFolder = '/tmp/sc-web-deploy/';
execSync('mkdir -p ' + tmpFolder)

metaFiles.forEach(mf => {
  //substitute json data paths
  const data = JSON.parse(fs.readFileSync(META_FOLDER+mf).toString());

  recursivelyReplaceValues(data, fileSubLookup);
  let dataOutput = `${tmpFolder}${mf}`;
  fs.writeFileSync(dataOutput, JSON.stringify(data));

  execSync(
      `aws s3 cp ${dataOutput} s3://${DATA_S3_BUCKET}/${DATA_DEST_PATH} --metadata-directive REPLACE --cache-control public,max-age=300,must-revalidate`,
      { stdio: "inherit" }
  );
});

execSync("git rev-parse HEAD > deployed-rev");
execSync(
  `aws s3 cp deployed-rev s3://${FILE_S3_BUCKET}/${S3_DEPLOYED_REV_KEY}`,
  { stdio: "inherit" }
);
