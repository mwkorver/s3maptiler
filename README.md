s3maptiler
===================

The purpose of this project is to support real-time tile mapping using S3 to store both tiles and source image geotifs using a auto-scaling OGC WMS service on the backend. In fact any WMS service can be used.
S3maptiler is a node app that can be run on Amazon Beanstalk, Lambda etc.

## OGC WMS

Open Geospatial Consortium (OGC)
The OGC (Open Geospatial Consortium) is an international non-profit organization committed to making quality open standards for the global geospatial community. 

Read more about WMS here
http://www.opengeospatial.org/standards/wms

## Serving Tiles from S3

S3 maptiler is meant to run as a redirect from S3. When a request to S3 for a tile 'misses' S3 redirects to S3maptiler. S3maptiler creates a tile, serves the response, and also copies the tile to S3 for the subsequent requests. You can manage how long the tiles persist on S3 by using S3 lifecycle policy.
For redirects to work you need to have your S3 bucket configured as a website and add a redirect rule.
See this gist for an example of S3 redirect rule.

https://gist.github.com/mwkorver/a9e7f038417e37ff4fb0

## Config 

server.js uses 4 environment variables to function. You can see them in env.js
WMS_SERVER points at your wms, if you run your own WMS on AWS, it would typically point at an ELB.
BUCKET_NAME is the S3 bucket you are using to serve tiles from. This is your tile cache.
TILE_PREFIX is a prefix to your TMS tile.
MAP_LAYERS is layer or layers that you use in your WMS request.

## Running

This is nodjs app meant to run on Amazon Elastic Beanstalk.
Zip the directory contents following instructions here.
http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs.html

## Test it

http://HOST_IP/heartbeat
