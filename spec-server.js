var express = require('express')
var bodyParser = require('body-parser')
var LpServer = require('./')

var lpServer = new LpServer({
  getClientId: function(req) {
    return 'xxx'
  }
})

express()
  .use(bodyParser.json())
  .post('/lpio', function(req, res, next) {
    var channel = lpServer.open({
      messages: req.body.messages,
      client: req.get('LPIO-Client'),
      channels: ['c'],
      req: req
    })

    channel.once('close', function(data) {
      res.json(data)
    })

    channel.once('error', function() {
      // We don't log errors here to reduce the noise.
      // Handle errors in the real application.
    })

    // User aborted request.
    req.once('close', function() {
      lpServer.close(req.body.client)
    })
  })
  .listen(3000)