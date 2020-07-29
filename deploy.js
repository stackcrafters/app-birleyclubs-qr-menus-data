#!/usr/bin/env node
const execSync = require('child_process').execSync;
const fs = require('fs');

const FILE_S3_BUCKET = 'stackcrafters-sc-web-assets-dev';
const DATA_FILE = 'data.json';
const LOCAL_ASSET_PATHS = "annabels/*";
const S3_PATH_PREFIX = "518f6460-1f14-4d4e-8b23-cc5871634f80/";
const S3_DEPLOYED_REV_KEY = `${S3_PATH_PREFIX}deployed-rev`;
const DATA_S3_BUCKET = 'stackcrafters-sc-web-data-dev';
const DATA_DEST_PATH = `${S3_PATH_PREFIX}data.json`;

const recursivelyReplaceValues = (obj, replacements) => {
    Object.values(obj).forEach((v) => {
        if (v && Array.isArray(v)) {
            v.forEach((o) => recursivelyReplaceValues(o, replacements));
        } else if (v && typeof v === 'object') {
            recursivelyReplaceValues(v, replacements);
        }
    });
    if (obj.href && Object.keys(replacements).indexOf(obj.href) > -1) {
        obj.href = `${replacements[obj.href]}`;//FILE_DOMAIN
    }
};

let deployedRev;
let res = execSync(`aws s3api head-object --bucket ${FILE_S3_BUCKET} --key ${S3_DEPLOYED_REV_KEY} || exit 0`);
if(res.length > 0){
    execSync(`aws s3 cp s3://${FILE_S3_BUCKET}/${S3_DEPLOYED_REV_KEY} deployed-rev`);//, {stdio: 'inherit'}
    deployedRev = fs.readFileSync('deployed-rev').toString().trim();
    if(execSync('git rev-parse HEAD').toString().trim() === deployedRev){
        console.log('up to date');
        process.exit(0);
    }
    console.log(`updating deployment ${deployedRev}`)
}
else{
    deployedRev = execSync('git rev-list HEAD | tail -n 1').toString().trim();
    console.log(`updating, no previous deployment (${deployedRev})`)
}

const fileListStr = execSync(`git diff --name-only ${deployedRev} HEAD | grep -E "\\\\.(jpg|png|pdf)$" || echo ''`).toString().trim();
if(fileListStr.length === 0){
    console.log('no files found to update');
    process.exit(0);
}

const fileHashLookup = {};
const allFiles = execSync(`find ${LOCAL_ASSET_PATHS} -regextype egrep -regex ".*\\\\.(jpg|png|pdf)"`).toString();
console.log('allFiles', allFiles)
allFiles.trim().split('\n').forEach(f => {
    fileHashLookup[f] = execSync(`git hash-object ${f} | cut -c1-7`).toString().trim();
});
console.log('fileHashLookup', fileHashLookup)

const fileDestLookup = Object.entries(fileHashLookup).reduce((acc, [f, h]) => {
    const file = /(.*)\.(.*)$/.exec(f);
    acc[f] = `${S3_PATH_PREFIX}${file[1]}.${h}.${file[2]}`;
    return acc;
}, {});
console.log('fileDestLookup', fileDestLookup)

//copy changed files to s3
fileListStr.trim().split('\n').forEach(f => {
    execSync(`aws s3 cp ${f} s3://${FILE_S3_BUCKET}/${fileDestLookup[f]}`, {stdio: 'inherit'});
});

//substitute json data paths
const data = JSON.parse(fs.readFileSync(DATA_FILE).toString());

const fileSubLookup = Object.entries(fileHashLookup).reduce((acc, [f, h]) => {
    const file = /(.*)\.(.*)$/.exec(f);
    acc[`/_assets/${f}`] = `/_assets/${file[1]}.${h}.${file[2]}`;
    return acc;
}, {});

// console.log(fileSubLookup);

recursivelyReplaceValues(data, fileSubLookup);
fs.writeFileSync('/tmp/data.json', JSON.stringify(data));

execSync(`aws s3 cp /tmp/data.json s3://${DATA_S3_BUCKET}/${DATA_DEST_PATH}`, {stdio: 'inherit'});

execSync('git rev-parse HEAD > deployed-rev');
execSync(`aws s3 cp deployed-rev s3://${FILE_S3_BUCKET}/${S3_DEPLOYED_REV_KEY}`, {stdio: 'inherit'});