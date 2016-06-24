var init = function(app, schema, sequelize, adminauth) {
      app.get('/yourapp/admin',
        adminauth,
        function(req, res) {
          res.send( "here is your admin");
        });
    //TODO:
    // sequelize.SETUP_SCHEMA_BLALHLAHBLAB

    return {
       link: {link: '/supershare/admin', title: 'SuperShare'},
       viewDirectory: __dirname + "views/"
    }
 }

module.exports = init;