Amazon S3 Maptiler
===================

The purpose of this project is to support real-time tile mapping using S3 to store both tiles and source image data using a auto-scaling OGC WMS service on the backend.
S3 Maptiler is a nodejs app that can be run on Amazon Beanstalk.

## OGC WMS

Open Geospatial Consortium (OGC)
The OGC (Open Geospatial Consortium) is an international not for profit organization committed to making quality open standards for the global geospatial community. 

Read more about WMS here
http://www.opengeospatial.org/standards/wms

## Serving Tiles from S3

S3 maptiler is meant to run as a redirect from S3. When a request to S3 for a tile 'misses' S3 redirects to S3maptiler. S3maptiler creates a tile, serves the response, and also copies the tile to S3 for the subsequent request.

## Running S3 Maptiler

server.js contains 2 variables called wmsServer and bucketname.
wmsServer points at your wms, typically EC2 ELB dns name.
bucketname is the S3 bucket you are using to serve tiles from.


## Running S3 Maptiler

This is nodjs app meant to run on Amazon Elastic Beanstalk.

Zip the directory contents following instructions here.
http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_nodejs.html


## Test it

http://HOST_IP: