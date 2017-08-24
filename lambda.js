'use strict'
process.env.CONFIGFILE = process.env.CONFIGFILE || './config/lambda.json'
const awsServerlessExpress = require('aws-serverless-express')
const app = require('./index').app
const server = awsServerlessExpress.createServer(app)
exports.handler = (event, context) => awsServerlessExpress.proxy(server, event, context)
