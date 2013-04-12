App = Ember.Application.create({LOG_TRANSITIONS: true});

App.Store = DS.Store.extend({
    revision: 12
});

DS.RESTAdapter.configure("plurals", {
    // There is only ever one session accessible to a user (theirs)
    // It'd be nice if singletons didn't need this
    session: 'session'
});
    
DS.RESTAdapter.reopen({
    namespace: 'hashi/api',
});


// --Model definitions--
App.Session = DS.Model.extend({
    uid: DS.attr("number"),
    email: DS.attr("string"),
});

App.Message = DS.Model.extend({
    id: DS.attr("number"), // Event sequence
    source: DS.belongsTo("App.User"),
    //args: DS.attrArray("string"),
    kinds: DS.attr("string"),
    timestamp: DS.attr("date"),
});

// Kind of useless - there's no real User model backing this
App.User = DS.Model.extend({
    nick: DS.attr("string"),
});

App.Channel = DS.Model.extend({
    topic: DS.attr("string"),
    messages: DS.hasMany("App.Message"),
    users: DS.hasMany("App.User"),
});

App.Network = DS.Model.extend({
    email: DS.attr("string"),
    hostname: DS.attr("string"),
    port: DS.attr("number"),
    ssl: DS.attr("boolean"),
    nick: DS.attr("string"),
    channels: DS.hasMany("App.Channel"),
});

// --Main router--
App.Router.map(function() {
    this.resource("networks", function () {
	this.route("network", {path: "/:hostname"});
    });
});

App.NetworkRoute = Ember.Route.extend({
    model: function () {
	return App.Network.find();
    }
});

// --Controllers--
App.ApplicationController = Ember.Controller.extend({
    session: null,
    init: function () {
	this._super();
	// There is never more than one session per instance
	this.session = App.Session.find(0);
    },
    login: function () {
	var application = this;

	// Indicate activity by greying out the BrowserID button
	$('#browserid').fadeTo("fast", 0.4);
	// Should make this come back somehow if you close the login window

	navigator.id.watch({
	    loggedInUser: null,
	    onlogin: function (assertion) {
		$.ajax({
		    type: 'POST',
		    url: '../api/login',
		    dataType: 'json',
		    data: { assertion: assertion },
		    success: function(res, status, xhr) {
			if (res === null) {
			    console.log("bad browserid assertion");
			}
			else {
			    console.log("login success");
			    application.set("session", App.Session.find(1));
			}
		    },
		    error: function(res, status, xhr) {
			console.log("login failure: " + res);
		    }
		});
	    },
	    onlogout: function () {
		$('#browserid').fadeTo("fast", 1.0);
	    },
	});
	navigator.id.request();
    },
    logout: function () {
	var application = this;
	$.ajax({
            type: 'POST',
            url: '../api/logout',
            success: function () {
		application.set("session", null);
	    },
	});
    },
});
