s3maptiler
===================

NOTE: This is a prototype and is not to be used for production. 
S3maptiler accepts TMS requests, parses the tilename to create a WMS request, then uses an WMS to create the requested map tile, serves it back, while saving it to S3 for subsequent requests. It is meant to run "behind" an S3 based tile cache, building tiles that are missing from the S3 bucket. The S3 bucket is where the initial request is made. When the map tile is missing S3 does a redirect to this app.
The data stored in S3 follows the OSGEO TMS specification.

  > https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification

You can use any WMS, but it is most performant when used in conjunction with a WMS running in the same AWS Region.
S3maptiler is a node app that can be run on EC2, Amazon Beanstalk, and if containerized, on ECS.

The Open Geospatial Consortium (OGC) is an international non-profit organization committed to making quality open standards for the global geospatial community. Read more about WMS here
  
  > http://www.opengeospatial.org/standards/wms

## Serving Tiles from S3

S3maptiler is meant to run as a redirect from S3. When a request to S3 for a tile 'misses', S3 redirects to S3maptiler. S3maptiler creates a tile, serves the response, and also copies the tile to S3 for any subsequent requests. You can manage how long the tiles persist on S3 by using S3 lifecycle policy.
For redirects to work you need to have your S3 bucket configured as a website and add a redirect rule.
See this gist for an example of S3 redirect rule.

  > https://gist.github.com/mwkorver/a9e7f038417e37ff4fb0

## Config 

server.js uses 4 environment variables to function. You can see them in example_env.js
WMS_SERVER points at your WMS, if you run your own WMS on AWS, it would typically point at an ELB that would front an auto-scaling group of WMS servers.
See this Docker container for an UMN Mapserver example.

  > https://github.com/mwkorver/mapserver


| Name        | Purpose   | Example  |
| ------------- |-------------|-----|
| WMS_SERVER  | WMS endpoint | http://raster.nationalmap.gov/... |
| BUCKET_NAME | S3 bucket you are using to serve tiles from. Your tile cache. | workshop-tms |
| TILE_PREFIX | Prefix of TMS tile | 1.0.0/tms-mercator-naip/ |
| MAP_LAYERS | layer names used in your WMS request  | utm11-50pct |


Remember that if you run this on EC2/Elastic Beanstalk use IAM Roles rather than IAM keys in config.js. 
Your IAM Role (or IAM User if not on EC2) should map to a policy that looks like this.

```javascript
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ],
        "Resource": ["arn:aws:s3:::BUCKET_NAME/TILE_PREFIX*"]
      }
    ]
  }
```

## Run

Test it locally, but a simple way to deploy this app in an HA fashion is to run it on Amazon Elastic Beanstalk.
Zip the directory contents following instructions here. 
  
  > http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs.html

## Test

  http://HOST_IP/heartbeat
