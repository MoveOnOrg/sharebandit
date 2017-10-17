'use strict'

const fullApp = require('./index')

fullApp.app.schemaActions.processDataIncrementally(function(){ return true })
