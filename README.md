s3maptiler
===================

This app accepts TMS requests, uses an OGC WMS to create the requested map tile, serves it back while saving it to S3 for subsequent requests. It is meant to run behind S3, building tiles that are missing from the S3 bucket. The S3 bucket is where the initial request is made. When the map tile is missing S3 does a redirect to this app.
You can use any WMS service, but it is most performant when useed in conjunction with a WMS running in the same AWS region.
S3maptiler is a node app that can be run on EC2, Amazon Beanstalk, and if containerized on ECS.

## OGC WMS

Open Geospatial Consortium (OGC)
The OGC (Open Geospatial Consortium) is an international non-profit organization committed to making quality open standards for the global geospatial community. Read more about WMS here
  
  http://www.opengeospatial.org/standards/wms

## Serving Tiles from S3

S3 maptiler is meant to run as a redirect from S3. When a request to S3 for a tile 'misses' S3 redirects to S3maptiler. S3maptiler creates a tile, serves the response, and also copies the tile to S3 for the subsequent requests. You can manage how long the tiles persist on S3 by using S3 lifecycle policy.
For redirects to work you need to have your S3 bucket configured as a website and add a redirect rule.
See this gist for an example of S3 redirect rule.

  https://gist.github.com/mwkorver/a9e7f038417e37ff4fb0

## Config 

server.js uses 4 environment variables to function. You can see them in example_env.js
WMS_SERVER points at your WMS, if you run your own WMS on AWS, it would typically point at an ELB that would front an auto-scaling group of WMS servers.
BUCKET_NAME is the S3 bucket you are using to serve tiles from. This is your tile cache.
TILE_PREFIX is a prefix to your TMS tile.
MAP_LAYERS is layer or layers that you use in your WMS request.

## Running

Test it locally, but a simple way to deploy this app in an HA fashion is to run it on Amazon Elastic Beanstalk.
Zip the directory contents following instructions here.
http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs.html

## Test it

  http://HOST_IP/heartbeat
