# app-birleyclubs-qr-menus-data

Menu and asset repository for Birley Clubs QR mini-sites.

PDF, JPG and PNGs pushed into the site folders will be automatically version hashed and deployed.

## AWS Deployment IAM Role
   
```json5
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:AbortMultipartUpload",
                "s3:DeleteObjectVersion",
                "s3:ListBucket",
                "s3:PutBucketCORS",
                "s3:DeleteObject",
                "s3:HeadBucket"
            ],
            "Resource": [
                "arn:aws:s3:::stackcrafters-sc-web-assets-dev",
                "arn:aws:s3:::stackcrafters-sc-web-assets-dev/518f6460-1f14-4d4e-8b23-cc5871634f80/*",
                "arn:aws:s3:::stackcrafters-sc-web-data-dev",
                "arn:aws:s3:::stackcrafters-sc-web-data-dev/518f6460-1f14-4d4e-8b23-cc5871634f80/*"
            ]
        }
    ]
}
```
