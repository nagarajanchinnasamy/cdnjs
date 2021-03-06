/**
 * @hello.js
 *
 * HelloJS is a client side Javascript SDK for making OAuth2 logins and subsequent REST calls.
 *
 * @author Andrew Dodson
 * @company Knarly
 *
 * @copyright Andrew Dodson, 2012 - 2013
 * @license MIT: You are free to use and modify this code for any use, on the condition that this copyright notice remains.
 */

// Can't use strict with arguments.callee
//"use strict";


//
// Setup
// Initiates the construction of the library

var hello = function(name){
	return hello.use(name);
};


hello.utils = {
	//
	// Extend the first object with the properties and methods of the second
	extend : function(r /*, a[, b[, ...]] */){

		// Get the arguments as an array but ommit the initial item
		var args = Array.prototype.slice.call(arguments,1);

		for(var i=0;i<args.length;i++){
			var a = args[i];
			if( r instanceof Object && a instanceof Object && r !== a ){
				for(var x in a){
					//if(a.hasOwnProperty(x)){
					r[x] = hello.utils.extend( r[x], a[x] );
					//}
				}
			}
			else{
				r = a;
			}
		}
		return r;
	}
};



/////////////////////////////////////////////////
// Core library
// This contains the following methods
// ----------------------------------------------
// init
// login
// logout
// getAuthRequest
/////////////////////////////////////////////////

hello.utils.extend( hello, {

	//
	// Options
	settings : {

		//
		// OAuth 2 authentication defaults
		redirect_uri  : window.location.href.split('#')[0],
		response_type : 'token',
		display       : 'popup',
		state         : '',

		//
		// OAuth 1 shim
		// The path to the OAuth1 server for signing user requests
		// Wanna recreate your own? checkout https://github.com/MrSwitch/node-oauth-shim
		oauth_proxy   : 'https://auth-server.herokuapp.com/proxy',

		//
		// API Timeout, milliseconds
		timeout : 20000,

		//
		// Default Network
		default_service : null,

		//
		// Force signin
		// When hello.login is fired, ignore current session expiry and continue with login
		force : true,


		//
		// Page URL
		// When `display=page` this property defines where the users page should end up after redirect_uri
		// Ths could be problematic if the redirect_uri is indeed the final place, 
		// Typically this circumvents the problem of the redirect_url being a dumb relay page.
		page_uri : window.location.href
	},


	//
	// Service
	// Get/Set the default service
	//
	service : function(service){

		//this.utils.warn("`hello.service` is deprecated");

		if(typeof (service) !== 'undefined' ){
			return this.utils.store( 'sync_service', service );
		}
		return this.utils.store( 'sync_service' );
	},


	//
	// Services
	// Collection of objects which define services configurations
	services : {},

	//
	// Use
	// Define a new instance of the Hello library with a default service
	//
	use : function(service){

		// Create self, which inherits from its parent
		var self = this.utils.objectCreate(this);

		// Inherit the prototype from its parent
		self.settings = this.utils.objectCreate(this.settings);

		// Define the default service
		if(service){
			self.settings.default_service = service;
		}

		// Create an instance of Events
		self.utils.Event.call(self);

		return self;
	},


	//
	// init
	// Define the clientId's for the endpoint services
	// @param object o, contains a key value pair, service => clientId
	// @param object opts, contains a key value pair of options used for defining the authentication defaults
	// @param number timeout, timeout in seconds
	//
	init : function(services,options){

		var utils = this.utils;

		if(!services){
			return this.services;
		}

		// Define provider credentials
		// Reformat the ID field
		for( var x in services ){if(services.hasOwnProperty(x)){
			if( typeof(services[x]) !== 'object' ){
				services[x] = {id : services[x]};
			}
		}}

		//
		// merge services if there already exists some
		utils.extend(this.services, services);

		//
		// Format the incoming
		for( x in this.services ){if(this.services.hasOwnProperty(x)){
			this.services[x].scope = this.services[x].scope || {};
		}}

		//
		// Update the default settings with this one.
		if(options){
			utils.extend(this.settings, options);

			// Do this immediatly incase the browser changes the current path.
			if("redirect_uri" in options){
				this.settings.redirect_uri = utils.url(options.redirect_uri).href;
			}
		}

		return this;
	},


	//
	// Login
	// Using the endpoint
	// @param network	stringify				name to connect to
	// @param options	object		(optional)	{display mode, is either none|popup(default)|page, scope: email,birthday,publish, .. }
	// @param callback	function	(optional)	fired on signin
	//
	login :  function(){

		// Create self
		// An object which inherits its parent as the prototype.
		// And constructs a new event chain.
		var self = this,
			utils = self.utils,
			promise = utils.Promise();

		// Get parameters
		var p = utils.args({network:'s', options:'o', callback:'f'}, arguments);


		// Local vars
		var url;

		// merge/override options with app defaults
		var opts = p.options = utils.merge(self.settings, p.options || {} );

		// Network
		p.network = p.network || self.settings.default_service;

		// Bind callback to both reject and fulfill states
		promise.proxy.then( p.callback, p.callback );

		// Trigger an event on the global listener
		function emit(s, value){
			hello.emit(s, value);
		}

		promise.proxy.then( emit.bind(this,"auth.login auth"), emit.bind(this,"auth.failed auth") );
		

		// Is our service valid?
		if( typeof(p.network) !== 'string' || !( p.network in self.services ) ){
			// trigger the default login.
			// ahh we dont have one.
			return promise.reject( error('invalid_network','The provided network was not recognized' ) );
		}

		//
		var provider  = self.services[p.network];


		//
		// Create a global listener to capture events triggered out of scope
		var callback_id = utils.globalEvent(function(str){

			// Save this locally
			// responseHandler returns a string, lets save this locally
			var obj;

			if ( str ){
				obj = JSON.parse(str);
			}
			else {
				obj = error( 'cancelled', 'The authentication was not completed' );
			}


			//
			// Handle these response using the local
			// Trigger on the parent
			if(!obj.error){

				// Save on the parent window the new credentials
				// This fixes an IE10 bug i think... atleast it does for me.
				utils.store(obj.network,obj);

				// fulfill a successful login
				promise.fulfill({
					network : obj.network,
					authResponse : obj
				});
			}
			else{
				// Reject a successful login
				promise.reject(obj);
			}
		});



		//
		// REDIRECT_URI
		// Is the redirect_uri root?
		//
		var redirect_uri = utils.url(opts.redirect_uri).href;


		//
		// Response Type
		//
		var response_type = provider.oauth.response_type || opts.response_type;

		// Fallback to token if the module hasn't defined a grant url
		if( response_type === 'code' && !provider.oauth.grant ){
			response_type = 'token';
		}


		//
		// QUERY STRING
		// querystring parameters, we may pass our own arguments to form the querystring
		//
		p.qs = {
			client_id	: encodeURIComponent( provider.id ),
			response_type : response_type,
			redirect_uri : encodeURIComponent( redirect_uri ),
			display		: opts.display,
			scope		: 'basic',
			state		: {
				client_id	: provider.id,
				network		: p.network,
				display		: opts.display,
				callback	: callback_id,
				state		: opts.state,
				redirect_uri: redirect_uri
			}
		};

		//
		// SESSION
		// Get current session for merging scopes, and for quick auth response
		var session = utils.store(p.network);

		//
		// SCOPES
		// Authentication permisions
		//
		
		// convert any array, or falsy value to a string.
		var scope = (opts.scope||'').toString();

		scope = (scope ? scope + ',' : '') + p.qs.scope;

		// Append scopes from a previous session
		// This helps keep app credentials constant,
		// Avoiding having to keep tabs on what scopes are authorized
		if(session && "scope" in session && session.scope instanceof String){
			scope += ","+ session.scope;
		}

		// Save in the State
		// Convert to a string because IE, has a problem moving Arrays between windows
		p.qs.state.scope = utils.unique( scope.split(/[,\s]+/) ).join(',');

		// Map replace each scope with the providers default scopes
		p.qs.scope = scope.replace(/[^,\s]+/ig, function(m){
			// Does this have a mapping?
			if (m in provider.scope){
				return provider.scope[m];
			}else{
				// Loop through all services and determine whether the scope is generic
				for(var x in self.services){
					var _scopes = self.services[x].scope;
					if(_scopes && m in _scopes){
						// found an instance of this scope, so lets not assume its special
						return '';
					}
				}
				// this is a unique scope to this service so lets in it.
				return m;
			}

		}).replace(/[,\s]+/ig, ',');

		// remove duplication and empty spaces
		p.qs.scope = utils.unique(p.qs.scope.split(/,+/)).join( provider.scope_delim || ',');




		//
		// FORCE
		// Is the user already signed in with the appropriate scopes, valid access_token?
		//
		if(opts.force===false){

			if( session && "access_token" in session && session.access_token && "expires" in session && session.expires > ((new Date()).getTime()/1e3) ){
				// What is different about the scopes in the session vs the scopes in the new login?
				var diff = utils.diff( session.scope || [], p.qs.state.scope || [] );
				if(diff.length===0){

					// Ok trigger the callback
					promise.fulfill({
						unchanged : true,
						network : p.network,
						authResponse : session
					});

					// Nothing has changed
					return promise;
				}
			}
		}


		// Page URL
		if ( opts.display === 'page' && opts.page_uri ){
			// Add a page location, place to endup after session has authenticated
			p.qs.state.page_uri = utils.url(opts.page_uri).href;
		}


		// Bespoke
		// Override login querystrings from auth_options
		if("login" in provider && typeof(provider.login) === 'function'){
			// Format the paramaters according to the providers formatting function
			provider.login(p);
		}



		// Add OAuth to state
		// Where the service is going to take advantage of the oauth_proxy
		if( response_type !== "token" ||
			parseInt(provider.oauth.version,10) < 2 ||
			( opts.display === 'none' && provider.oauth.grant && session && session.refresh_token ) ){

			// Add the oauth endpoints
			p.qs.state.oauth = provider.oauth;

			// Add the proxy url
			p.qs.state.oauth_proxy = opts.oauth_proxy;

		}


		// Convert state to a string
		p.qs.state = encodeURIComponent( JSON.stringify(p.qs.state) );


		//
		// URL
		//
		if( parseInt(provider.oauth.version,10) === 1 ){

			// Turn the request to the OAuth Proxy for 3-legged auth
			url = utils.qs( opts.oauth_proxy, p.qs, encodeFunction );
		}

		// Refresh token
		else if( opts.display === 'none' && provider.oauth.grant && session && session.refresh_token ){

			// Add the refresh_token to the request
			p.qs.refresh_token = session.refresh_token;

			// Define the request path
			url = utils.qs( opts.oauth_proxy, p.qs, encodeFunction );
		}

		// 
		else{

			url = utils.qs( provider.oauth.auth, p.qs, encodeFunction );
		}



		//
		// Execute
		// Trigger how we want self displayed
		// Calling Quietly?
		//
		if( opts.display === 'none' ){
			// signin in the background, iframe
			utils.iframe(url);
		}


		// Triggering popup?
		else if( opts.display === 'popup'){


			var popup = utils.popup( url, redirect_uri, opts.window_width || 500, opts.window_height || 550 );

			var timer = setInterval(function(){
				if(!popup||popup.closed){
					clearInterval(timer);
					if(!promise.state){

						var resp = error("cancelled","Login has been cancelled");

						if(!popup){
							resp = error("blocked",'Popup was blocked');
						}

						resp.network = p.network;

						promise.reject(resp);
					}
				}
			}, 100);
		}

		else {
			window.location = url;
		}

		return promise.proxy;


		function error(code,message){
			return {
				error : {
					code : code,
					message : message
				}
			};
		}


		function encodeFunction(s){return s;}
	},


	//
	// Logout
	// Remove any data associated with a given service
	// @param string name of the service
	// @param function callback
	//
	logout : function(){

		var self = this;
		var utils = self.utils;

		// Create a new promise
		var promise = utils.Promise();

		var p = utils.args({name:'s', options: 'o', callback:"f" }, arguments);

		p.options = p.options || {};

		// Add callback to events
		promise.proxy.then( p.callback, p.callback );

		// Trigger an event on the global listener
		function emit(s, value){
			hello.emit(s, value);
		}

		promise.proxy.then( emit.bind(this,"auth.logout auth"), emit.bind(this,"error") );




		// Netowrk
		p.name = p.name || this.settings.default_service;


		if( p.name && !( p.name in self.services ) ){

			promise.reject( error( 'invalid_network', 'The network was unrecognized' ) );

		}
		else if(p.name && utils.store(p.name)){

			// Define the callback
			var callback = function(opts){

				// Remove from the store
				utils.store(p.name,'');

				// Emit events by default
				promise.fulfill( hello.utils.merge( {network:p.name}, opts || {} ) );
			};

			//
			// Run an async operation to remove the users session
			// 
			var _opts = {};
			if(p.options.force){
				var logout = self.services[p.name].logout;
				if( logout ){
					// Convert logout to URL string,
					// If no string is returned, then this function will handle the logout async style
					if(typeof(logout) === 'function' ){
						logout = logout(callback);
					}
					// If logout is a string then assume URL and open in iframe.
					if(typeof(logout)==='string'){
						utils.iframe( logout );
						_opts.force = null;
						_opts.message = "Logout success on providers site was indeterminate";
					}
					else if(logout === undefined){
						// the callback function will handle the response.
						return promise.proxy;
					}
				}
			}

			//
			// Remove local credentials
			callback(_opts);
		}
		else{
			promise.reject( error( 'invalid_session','There was no session to remove' ) );
		}

		return promise.proxy;

		function error(code,message){
			return {
				error : {
					code : code,
					message : message
				}
			};
		}
	},



	//
	// getAuthResponse
	// Returns all the sessions that are subscribed too
	// @param string optional, name of the service to get information about.
	//
	getAuthResponse : function(service){

		// If the service doesn't exist
		service = service || this.settings.default_service;

		if( !service || !( service in this.services ) ){
			return null;
		}

		return this.utils.store(service) || null;
	},


	//
	// Events
	// Define placeholder for the events
	events : {}
});







///////////////////////////////////
// Core Utilities
///////////////////////////////////

hello.utils.extend( hello.utils, {

	// Append the querystring to a url
	// @param string url
	// @param object parameters
	qs : function(url, params, formatFunction){
		if(params){
			var reg;
			for(var x in params){
				if(url.indexOf(x)>-1){
					var str = "[\\?\\&]"+x+"=[^\\&]*";
					reg = new RegExp(str);
					url = url.replace(reg,'');
				}
			}
		}
		return url + (!this.isEmpty(params) ? ( url.indexOf('?') > -1 ? "&" : "?" ) + this.param(params,formatFunction) : '');
	},
	

	//
	// Param
	// Explode/Encode the parameters of an URL string/object
	// @param string s, String to decode
	//
	param : function( s, formatFunction ){
		var b,
			a = {},
			m;
		
		if(typeof(s)==='string'){

			formatFunction = formatFunction || decodeURIComponent;

			m = s.replace(/^[\#\?]/,'').match(/([^=\/\&]+)=([^\&]+)/g);
			if(m){
				for(var i=0;i<m.length;i++){
					b = m[i].match(/([^=]+)=(.*)/);
					a[b[1]] = formatFunction( b[2] );
				}
			}
			return a;
		}
		else {

			formatFunction = formatFunction || encodeURIComponent;

			var o = s;
		
			a = [];

			for( var x in o ){if(o.hasOwnProperty(x)){
				if( o.hasOwnProperty(x) ){
					a.push( [x, o[x] === '?' ? '?' : formatFunction(o[x]) ].join('=') );
				}
			}}

			return a.join('&');
		}
	},
	

	//
	// Local Storage Facade
	store : (function(localStorage){

		//
		// LocalStorage
		var a = [localStorage,window.sessionStorage],
			i=0;

		// Set LocalStorage
		localStorage = a[i++];

		while(localStorage){
			try{
				localStorage.setItem(i,i);
				localStorage.removeItem(i);
				break;
			}
			catch(e){
				localStorage = a[i++];
			}
		}

		if(!localStorage){
			localStorage = {
				getItem : function(prop){
					prop = prop +'=';
					var m = document.cookie.split(";");
					for(var i=0;i<m.length;i++){
						var _m = m[i].replace(/(^\s+|\s+$)/,'');
						if(_m && _m.indexOf(prop)===0){
							return _m.substr(prop.length);
						}
					}
					return null;
				},
				setItem : function(prop, value){
					document.cookie = prop + '=' + value;
				}
			};
		}


		function get(){
			var json = {};
			try{
				json = JSON.parse(localStorage.getItem('hello')) || {};
			}catch(e){}
			return json;
		}

		function set(json){
			localStorage.setItem('hello', JSON.stringify(json));
		}


		// Does this browser support localStorage?

		return function (name,value,days) {

			// Local storage
			var json = get();

			if(name && value === undefined){
				return json[name] || null;
			}
			else if(name && value === null){
				try{
					delete json[name];
				}
				catch(e){
					json[name]=null;
				}
			}
			else if(name){
				json[name] = value;
			}
			else {
				return json;
			}

			set(json);

			return json || null;
		};

	})(window.localStorage),

	//
	// Create and Append new Dom elements
	// @param node string
	// @param attr object literal
	// @param dom/string
	//
	append : function(node,attr,target){

		var n = typeof(node)==='string' ? document.createElement(node) : node;

		if(typeof(attr)==='object' ){
			if( "tagName" in attr ){
				target = attr;
			}
			else{
				for(var x in attr){if(attr.hasOwnProperty(x)){
					if(typeof(attr[x])==='object'){
						for(var y in attr[x]){if(attr[x].hasOwnProperty(y)){
							n[x][y] = attr[x][y];
						}}
					}
					else if(x==="html"){
						n.innerHTML = attr[x];
					}
					// IE doesn't like us setting methods with setAttribute
					else if(!/^on/.test(x)){
						n.setAttribute( x, attr[x]);
					}
					else{
						n[x] = attr[x];
					}
				}}
			}
		}
		
		if(target==='body'){
			(function self(){
				if(document.body){
					document.body.appendChild(n);
				}
				else{
					setTimeout( self, 16 );
				}
			})();
		}
		else if(typeof(target)==='object'){
			target.appendChild(n);
		}
		else if(typeof(target)==='string'){
			document.getElementsByTagName(target)[0].appendChild(n);
		}
		return n;
	},

	//
	// create IFRAME
	// An easy way to create a hidden iframe
	// @param string src
	//
	iframe : function(src){
		this.append('iframe', { src : src, style : {position:'absolute',left:"-1000px",bottom:0,height:'1px',width:'1px'} }, 'body');
	},

	//
	// merge
	// recursive merge two objects into one, second parameter overides the first
	// @param a array
	//
	merge : function(/*a,b,c,..n*/){
		var args = Array.prototype.slice.call(arguments);
		args.unshift({});
		return this.extend.apply(null, args);
	},

	//
	// Args utility
	// Makes it easier to assign parameters, where some are optional
	// @param o object
	// @param a arguments
	//
	args : function(o,args){

		var p = {},
			i = 0,
			t = null,
			x = null;
		
		// define x
		// x is the first key in the list of object parameters
		for(x in o){if(o.hasOwnProperty(x)){
			break;
		}}

		// Passing in hash object of arguments?
		// Where the first argument can't be an object
		if((args.length===1)&&(typeof(args[0])==='object')&&o[x]!='o!'){

			// Could this object still belong to a property?
			// Check the object keys if they match any of the property keys
			for(x in args[0]){if(o.hasOwnProperty(x)){
				// Does this key exist in the property list?
				if( x in o ){
					// Yes this key does exist so its most likely this function has been invoked with an object parameter
					// return first argument as the hash of all arguments
					return args[0];
				}
			}}
		}

		// else loop through and account for the missing ones.
		for(x in o){if(o.hasOwnProperty(x)){

			t = typeof( args[i] );

			if( ( typeof( o[x] ) === 'function' && o[x].test(args[i]) ) || ( typeof( o[x] ) === 'string' && (
					( o[x].indexOf('s')>-1 && t === 'string' ) ||
					( o[x].indexOf('o')>-1 && t === 'object' ) ||
					( o[x].indexOf('i')>-1 && t === 'number' ) ||
					( o[x].indexOf('a')>-1 && t === 'object' ) ||
					( o[x].indexOf('f')>-1 && t === 'function' )
				) )
			){
				p[x] = args[i++];
			}
			
			else if( typeof( o[x] ) === 'string' && o[x].indexOf('!')>-1 ){
				// ("Whoops! " + x + " not defined");
				return false;
			}
		}}
		return p;
	},

	//
	// URL
	// Returns a URL instance
	//
	url : function(path){

		// If the path is empty
		if(!path){
			return window.location;
		}
		// Chrome and FireFox support new URL() to extract URL objects
		else if( window.URL && URL instanceof Function && URL.length !== 0){
			return new URL(path, window.location);
		}
		else{
			// ugly shim, it works!
			var a = document.createElement('a');
			a.href = path;
			return a;
		}
	},

	//
	// diff
	diff : function(a,b){
		var r = [];
		for(var i=0;i<b.length;i++){
			if(this.indexOf(a,b[i])===-1){
				r.push(b[i]);
			}
		}
		return r;
	},

	//
	// indexOf
	// IE hack Array.indexOf doesn't exist prior to IE9
	indexOf : function(a,s){
		// Do we need the hack?
		if(a.indexOf){
			return a.indexOf(s);
		}

		for(var j=0;j<a.length;j++){
			if(a[j]===s){
				return j;
			}
		}
		return -1;
	},


	//
	// unique
	// remove duplicate and null values from an array
	// @param a array
	//
	unique : function(a){
		if(typeof(a)!=='object'){ return []; }
		var r = [];
		for(var i=0;i<a.length;i++){

			if(!a[i]||a[i].length===0||this.indexOf(r, a[i])!==-1){
				continue;
			}
			else{
				r.push(a[i]);
			}
		}
		return r;
	},


	// isEmpty
	isEmpty : function (obj){
		// scalar?
		if(!obj){
			return true;
		}

		// Array?
		if(obj && obj.length>0) return false;
		if(obj && obj.length===0) return true;

		// object?
		for (var key in obj) {
			if (obj.hasOwnProperty(key)){
				return false;
			}
		}
		return true;
	},

	// Shim, Object create
	// A shim for Object.create(), it adds a prototype to a new object
	objectCreate : (function(){
		if (Object.create) {
			return Object.create;
		}
		function F(){}
		return function(o){
			if (arguments.length != 1) {
				throw new Error('Object.create implementation only accepts one parameter.');
			}
			F.prototype = o;
			return new F();
		};
	})(),

	/*
	//
	// getProtoTypeOf
	// Once all browsers catchup we can access the prototype
	// Currently: manually define prototype object in the `parent` attribute
	getPrototypeOf : (function(){
		if(Object.getPrototypeOf){
			return Object.getPrototypeOf;
		}
		else if(({}).__proto__){
			return function(obj){
				return obj.__proto__;
			};
		}
		return function(obj){
			if(obj.prototype && obj !== obj.prototype.constructor){
				return obj.prototype.constructor;
			}
		};
	})(),
	*/
	

	/*!
	**  Thenable -- Embeddable Minimum Strictly-Compliant Promises/A+ 1.1.1 Thenable
	**  Copyright (c) 2013-2014 Ralf S. Engelschall <http://engelschall.com>
	**  Licensed under The MIT License <http://opensource.org/licenses/MIT>
	**  Source-Code distributed on <http://github.com/rse/thenable>
	*/

	Promise : (function(){
		/*  promise states [Promises/A+ 2.1]  */
		var STATE_PENDING   = 0;                                         /*  [Promises/A+ 2.1.1]  */
		var STATE_FULFILLED = 1;                                         /*  [Promises/A+ 2.1.2]  */
		var STATE_REJECTED  = 2;                                         /*  [Promises/A+ 2.1.3]  */

		/*  promise object constructor  */
		var api = function (executor) {
			/*  optionally support non-constructor/plain-function call  */
			if (!(this instanceof api))
				return new api(executor);

			/*  initialize object  */
			this.id           = "Thenable/1.0.6";
			this.state        = STATE_PENDING; /*  initial state  */
			this.fulfillValue = undefined;     /*  initial value  */     /*  [Promises/A+ 1.3, 2.1.2.2]  */
			this.rejectReason = undefined;     /*  initial reason */     /*  [Promises/A+ 1.5, 2.1.3.2]  */
			this.onFulfilled  = [];            /*  initial handlers  */
			this.onRejected   = [];            /*  initial handlers  */

			/*  provide optional information-hiding proxy  */
			this.proxy = {
				then: this.then.bind(this)
			};

			/*  support optional executor function  */
			if (typeof executor === "function")
				executor.call(this, this.fulfill.bind(this), this.reject.bind(this));
		};

		/*  promise API methods  */
		api.prototype = {
			/*  promise resolving methods  */
			fulfill: function (value) { return deliver(this, STATE_FULFILLED, "fulfillValue", value); },
			reject:  function (value) { return deliver(this, STATE_REJECTED,  "rejectReason", value); },

			/*  "The then Method" [Promises/A+ 1.1, 1.2, 2.2]  */
			then: function (onFulfilled, onRejected) {
				var curr = this;
				var next = new api();                                    /*  [Promises/A+ 2.2.7]  */
				curr.onFulfilled.push(
					resolver(onFulfilled, next, "fulfill"));             /*  [Promises/A+ 2.2.2/2.2.6]  */
				curr.onRejected.push(
					resolver(onRejected,  next, "reject" ));             /*  [Promises/A+ 2.2.3/2.2.6]  */
				execute(curr);
				return next.proxy;                                       /*  [Promises/A+ 2.2.7, 3.3]  */
			}
		};

		/*  deliver an action  */
		var deliver = function (curr, state, name, value) {
			if (curr.state === STATE_PENDING) {
				curr.state = state;                                      /*  [Promises/A+ 2.1.2.1, 2.1.3.1]  */
				curr[name] = value;                                      /*  [Promises/A+ 2.1.2.2, 2.1.3.2]  */
				execute(curr);
			}
			return curr;
		};

		/*  execute all handlers  */
		var execute = function (curr) {
			if (curr.state === STATE_FULFILLED)
				execute_handlers(curr, "onFulfilled", curr.fulfillValue);
			else if (curr.state === STATE_REJECTED)
				execute_handlers(curr, "onRejected",  curr.rejectReason);
		};

		/*  execute particular set of handlers  */
		var execute_handlers = function (curr, name, value) {
			/* global process: true */
			/* global setImmediate: true */
			/* global setTimeout: true */

			/*  short-circuit processing  */
			if (curr[name].length === 0)
				return;

			/*  iterate over all handlers, exactly once  */
			var handlers = curr[name];
			curr[name] = [];                                             /*  [Promises/A+ 2.2.2.3, 2.2.3.3]  */
			var func = function () {
				for (var i = 0; i < handlers.length; i++)
					handlers[i](value);                                  /*  [Promises/A+ 2.2.5]  */
			};

			/*  execute procedure asynchronously  */                     /*  [Promises/A+ 2.2.4, 3.1]  */
			if (typeof process === "object" && typeof process.nextTick === "function")
				process.nextTick(func);
			else if (typeof setImmediate === "function")
				setImmediate(func);
			else
				setTimeout(func, 0);
		};

		/*  generate a resolver function  */
		var resolver = function (cb, next, method) {
			return function (value) {
				if (typeof cb !== "function")                            /*  [Promises/A+ 2.2.1, 2.2.7.3, 2.2.7.4]  */
					next[method].call(next, value);                      /*  [Promises/A+ 2.2.7.3, 2.2.7.4]  */
				else {
					var result;
					try { result = cb(value); }                          /*  [Promises/A+ 2.2.2.1, 2.2.3.1, 2.2.5, 3.2]  */
					catch (e) {
						next.reject(e);                                  /*  [Promises/A+ 2.2.7.2]  */
						return;
					}
					resolve(next, result);                               /*  [Promises/A+ 2.2.7.1]  */
				}
			};
		};

		/*  "Promise Resolution Procedure"  */                           /*  [Promises/A+ 2.3]  */
		var resolve = function (promise, x) {
			/*  sanity check arguments  */                               /*  [Promises/A+ 2.3.1]  */
			if (promise === x || promise.proxy === x) {
				promise.reject(new TypeError("cannot resolve promise with itself"));
				return;
			}

			/*  surgically check for a "then" method
				(mainly to just call the "getter" of "then" only once)  */
			var then;
			if ((typeof x === "object" && x !== null) || typeof x === "function") {
				try { then = x.then; }                                   /*  [Promises/A+ 2.3.3.1, 3.5]  */
				catch (e) {
					promise.reject(e);                                   /*  [Promises/A+ 2.3.3.2]  */
					return;
				}
			}

			/*  handle own Thenables    [Promises/A+ 2.3.2]
				and similar "thenables" [Promises/A+ 2.3.3]  */
			if (typeof then === "function") {
				var resolved = false;
				try {
					/*  call retrieved "then" method */                  /*  [Promises/A+ 2.3.3.3]  */
					then.call(x,
						/*  resolvePromise  */                           /*  [Promises/A+ 2.3.3.3.1]  */
						function (y) {
							if (resolved) return; resolved = true;       /*  [Promises/A+ 2.3.3.3.3]  */
							if (y === x)                                 /*  [Promises/A+ 3.6]  */
								promise.reject(new TypeError("circular thenable chain"));
							else
								resolve(promise, y);
						},

						/*  rejectPromise  */                            /*  [Promises/A+ 2.3.3.3.2]  */
						function (r) {
							if (resolved) return; resolved = true;       /*  [Promises/A+ 2.3.3.3.3]  */
							promise.reject(r);
						}
					);
				}
				catch (e) {
					if (!resolved)                                       /*  [Promises/A+ 2.3.3.3.3]  */
						promise.reject(e);                               /*  [Promises/A+ 2.3.3.3.4]  */
				}
				return;
			}

			/*  handle other values  */
			promise.fulfill(x);                                          /*  [Promises/A+ 2.3.4, 2.3.3.4]  */
		};

		/*  export API  */
		return api;
	})(),




	//
	// Event
	// A contructor superclass for adding event menthods, on, off, emit.
	//
	Event : function(){

		var separator = /[\s\,]+/;

		// If this doesn't support getProtoType then we can't get prototype.events of the parent
		// So lets get the current instance events, and add those to a parent property
		this.parent = {
			events : this.events,
			findEvents : this.findEvents,
			parent : this.parent,
			utils : this.utils
		};

		this.events = {};


		//
		// On, Subscribe to events
		// @param evt		string
		// @param callback	function
		//
		this.on = function(evt, callback){

			if(callback&&typeof(callback)==='function'){
				var a = evt.split(separator);
				for(var i=0;i<a.length;i++){

					// Has this event already been fired on this instance?
					this.events[a[i]] = [callback].concat(this.events[a[i]]||[]);
				}
			}

			return this;
		};


		//
		// Off, Unsubscribe to events
		// @param evt		string
		// @param callback	function
		//
		this.off = function(evt, callback){

			this.findEvents(evt, function(name, index){
				if( !callback || this.events[name][index] === callback){
					this.events[name][index] = null;
				}
			});

			return this;
		};

		//
		// Emit
		// Triggers any subscribed events
		//
		this.emit = function(evt /*, data, ... */){

			// Get arguments as an Array, knock off the first one
			var args = Array.prototype.slice.call(arguments, 1);
			args.push(evt);

			// Handler
			var handler = function(name, index){

				// Replace the last property with the event name
				args[args.length-1] = (name === '*'? evt : name);

				// Trigger
				this.events[name][index].apply(this, args);
			};

			// Find the callbacks which match the condition and call
			var proto = this;
			while( proto && proto.findEvents ){

				// Find events which match
				proto.findEvents(evt + ',*', handler);

				// proto = this.utils.getPrototypeOf(proto);
				proto = proto.parent;
			}

			return this;
		};

		//
		// Easy functions
		this.emitAfter = function(){
			var self = this,
				args = arguments;
			setTimeout(function(){
				self.emit.apply(self, args);
			},0);
			return this;
		};

		this.findEvents = function(evt, callback){

			var a = evt.split(separator);

			for(var name in this.events){if(this.events.hasOwnProperty(name)){

				if( hello.utils.indexOf(a,name) > -1 ){

					for(var i=0;i<this.events[name].length;i++){

						// Does the event handler exist?
						if(this.events[name][i]){
							// Emit on the local instance of this
							callback.call(this, name, i);
						}
					}
				}
			}}
		};

		return this;

	},


	//
	// Global Events
	// Attach the callback to the window object
	// Return its unique reference
	globalEvent : function(callback, guid){
		// If the guid has not been supplied then create a new one.
		guid = guid || "_hellojs_"+parseInt(Math.random()*1e12,10).toString(36);

		// Define the callback function
		window[guid] = function(){
			// Trigger the callback
			try{
				bool = callback.apply(this, arguments);
			}
			catch(e){
				console.error(e);
			}

			if(bool){
				// Remove this handler reference
				try{
					delete window[guid];
				}catch(e){}
			}
		};
		return guid;
	},


	//
	// Trigger a clientside Popup
	// This has been augmented to support PhoneGap
	//
	popup : function(url, redirect_uri, windowWidth, windowHeight){

		var documentElement = document.documentElement;

		// Multi Screen Popup Positioning (http://stackoverflow.com/a/16861050)
		//   Credit: http://www.xtf.dk/2011/08/center-new-popup-window-even-on.html
		// Fixes dual-screen position                         Most browsers      Firefox
		var dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left;
		var dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top;

		var width = window.innerWidth || documentElement.clientWidth || screen.width;
		var height = window.innerHeight || documentElement.clientHeight || screen.height;

		var left = ((width - windowWidth) / 2) + dualScreenLeft;
		var top  = ((height - windowHeight) / 2) + dualScreenTop;

		// Create a function for reopening the popup, and assigning events to the new popup object
		// This is a fix whereby triggering the
		var open = function (url){

			// Trigger callback
			var popup = window.open(
				url,
				'_blank',
				"resizeable=true,height=" + windowHeight + ",width=" + windowWidth + ",left=" + left + ",top="  + top
			);

			// PhoneGap support
			// Add an event listener to listen to the change in the popup windows URL
			// This must appear before popup.focus();
			if( popup && popup.addEventListener ){

				// Get the origin of the redirect URI

				var a = hello.utils.url(redirect_uri);
				var redirect_uri_origin = a.origin || (a.protocol + "//" + a.hostname);


				// Listen to changes in the InAppBrowser window

				popup.addEventListener('loadstart', function(e){

					var url = e.url;

					// Is this the path, as given by the redirect_uri?
					// Check the new URL agains the redirect_uri_origin.
					// According to #63 a user could click 'cancel' in some dialog boxes ....
					// The popup redirects to another page with the same origin, yet we still wish it to close.

					if(url.indexOf(redirect_uri_origin)!==0){
						return;
					}

					// Split appart the URL
					var a = hello.utils.url(url);


					// We dont have window operations on the popup so lets create some
					// The location can be augmented in to a location object like so...

					var _popup = {
						location : {
							// Change the location of the popup
							assign : function(location){
								
								// Unfourtunatly an app is may not change the location of a InAppBrowser window.
								// So to shim this, just open a new one.

								popup.addEventListener('exit', function(){

									// For some reason its failing to close the window if a new window opens too soon.

									setTimeout(function(){
										open(location);
									},1000);
								});
							},
							search : a.search,
							hash : a.hash,
							href : a.href
						},
						close : function(){
							//alert('closing location:'+url);
							if(popup.close){
								popup.close();
							}
						}
					};

					// Then this URL contains information which HelloJS must process
					// URL string
					// Window - any action such as window relocation goes here
					// Opener - the parent window which opened this, aka this script

					hello.utils.responseHandler( _popup, window );


					// Always close the popup reguardless of whether the hello.utils.responseHandler detects a state parameter or not in the querystring.
					// Such situations might arise such as those in #63

					_popup.close();

				});
			}


			//
			// focus on this popup
			//
			if( popup && popup.focus ){
				popup.focus();
			}


			return popup;
		};


		//
		// Call the open() function with the initial path
		//
		// OAuth redirect, fixes URI fragments from being lost in Safari
		// (URI Fragments within 302 Location URI are lost over HTTPS)
		// Loading the redirect.html before triggering the OAuth Flow seems to fix it.
		// 
		// FIREFOX, decodes URL fragments when calling location.hash. 
		//  - This is bad if the value contains break points which are escaped
		//  - Hence the url must be encoded twice as it contains breakpoints.
		if (navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1) {
			url = redirect_uri + "#oauth_redirect=" + encodeURIComponent(encodeURIComponent(url));
		}

		return open( url );
	},


	//
	// OAuth/API Response Handler
	//
	responseHandler : function( window, parent ){

		var utils = this, p;

		//
		var location = window.location;

		//
		// Add a helper for relocating, instead of window.location  = url;
		//
		var relocate = function(path){
			if(location.assign){
				location.assign(path);
			}
			else{
				window.location = path;
			}
		};

		//
		// Is this an auth relay message which needs to call the proxy?
		// 

		p = utils.param(location.search);

		// IS THIS AN OAUTH2 SERVER RESPONSE? OR AN OAUTH1 SERVER RESPONSE?
		if( p  && ( (p.code&&p.state) || (p.oauth_token&&p.proxy_url) ) ){
			// JSON decode
			var state = JSON.parse(p.state);
			// Add this path as the redirect_uri
			p.redirect_uri = state.redirect_uri || location.href.replace(/[\?\#].*$/,'');
			// redirect to the host
			var path = (state.oauth_proxy || p.proxy_url) + "?" + utils.param(p);

			relocate( path );
			return;
		}

		//
		// Save session, from redirected authentication
		// #access_token has come in?
		//
		// FACEBOOK is returning auth errors within as a query_string... thats a stickler for consistency.
		// SoundCloud is the state in the querystring and the token in the hashtag, so we'll mix the two together
		
		p = utils.merge(utils.param(location.search||''), utils.param(location.hash||''));

		
		// if p.state
		if( p && "state" in p ){

			// remove any addition information
			// e.g. p.state = 'facebook.page';
			try{
				var a = JSON.parse(p.state);
				utils.extend(p, a);
			}catch(e){
				console.error("Could not decode state parameter");
			}

			// access_token?
			if( ("access_token" in p&&p.access_token) && p.network ){

				if(!p.expires_in || parseInt(p.expires_in,10) === 0){
					// If p.expires_in is unset, set to 0
					p.expires_in = 0;
				}
				p.expires_in = parseInt(p.expires_in,10);
				p.expires = ((new Date()).getTime()/1e3) + (p.expires_in || ( 60 * 60 * 24 * 365 ));

				// Lets use the "state" to assign it to one of our networks
				authCallback( p, window, parent );
			}

			//error=?
			//&error_description=?
			//&state=?
			else if( ("error" in p && p.error) && p.network ){
				// Error object
				p.error = {
					code: p.error,
					message : p.error_message || p.error_description
				};

				// Let the state handler handle it.
				authCallback( p, window, parent );
			}

			// API Call, or a Cancelled login
			// Result is serialized JSON string.
			else if( p.callback && p.callback in parent ){

				// trigger a function in the parent
				var res = "result" in p && p.result ? JSON.parse(p.result) : false;

				// Trigger the callback on the parent
				parent[p.callback]( res );

				// Close this window
				closeWindow();
			}

			// If this page is still open
			if( p.page_uri ){
				window.location = p.page_uri;
			}
			

		}
		//
		// OAuth redirect, fixes URI fragments from being lost in Safari
		// (URI Fragments within 302 Location URI are lost over HTTPS)
		// Loading the redirect.html before triggering the OAuth Flow seems to fix it.
		else if("oauth_redirect" in p){

			relocate( decodeURIComponent(p.oauth_redirect) );
			return;
		}



		//
		// AuthCallback
		// Trigger a callback to authenticate
		//
		function authCallback(obj, window, parent){

			// Trigger the callback on the parent
			utils.store(obj.network, obj );

			// if this is a page request
			// therefore it has no parent or opener window to handle callbacks
			if( ("display" in obj) && obj.display === 'page' ){
				return;
			}

			if(parent){
				// Call the generic listeners
	//				win.hello.emit(network+":auth."+(obj.error?'failed':'login'), obj);
				// Call the inline listeners

				// to do remove from session object...
				var cb = obj.callback;
				try{
					delete obj.callback;
				}catch(e){}

				// Update store
				utils.store(obj.network,obj);

				// Call the globalEvent function on the parent
				if(cb in parent){

					// its safer to pass back a string to the parent, rather than an object/array
					// Better for IE8
					var str = JSON.stringify(obj);

					try{
						parent[cb](str);
					}
					catch(e){
						// "Error thrown whilst executing parent callback"
					}
				}
				else{
					// "Error: Callback missing from parent window, snap!"
				}

			}
			//console.log("Trying to close window");

			closeWindow();
		}


		function closeWindow(){

			// Close this current window
			try{
				window.close();
			}
			catch(e){}

			// IOS bug wont let us close a popup if still loading
			if(window.addEventListener){
				window.addEventListener('load', function(){
					window.close();
				});
			}

		}

	}

});


//////////////////////////////////
// Events
//////////////////////////////////

// Extend the hello object with its own event instance
hello.utils.Event.call(hello);






/////////////////////////////////////
//
// Save any access token that is in the current page URL
// Handle any response solicited through iframe hash tag following an API request
//
/////////////////////////////////////

hello.utils.responseHandler( window, window.opener || window.parent );



///////////////////////////////////
// Monitoring session state
// Check for session changes
///////////////////////////////////

(function(hello){

	// Monitor for a change in state and fire
	var old_session = {},

		// Hash of expired tokens
		expired = {};

	//
	// Listen to other triggers to Auth events, use these to update this
	//
	hello.on('auth.login, auth.logout', function(auth){
		if(auth&&typeof(auth)==='object'&&auth.network){
			old_session[auth.network] = hello.utils.store(auth.network) || {};
		}
	});
	


	(function self(){

		var CURRENT_TIME = ((new Date()).getTime()/1e3);
		var emit = function(event_name){
			hello.emit("auth."+event_name, {
				network: name,
				authResponse: session
			});
		};

		// Loop through the services
		for(var name in hello.services){if(hello.services.hasOwnProperty(name)){

			if(!hello.services[name].id){
				// we haven't attached an ID so dont listen.
				continue;
			}
		
			// Get session
			var session = hello.utils.store(name) || {};
			var provider = hello.services[name];
			var oldsess = old_session[name] || {};

			//
			// Listen for globalEvents that did not get triggered from the child
			//
			if(session && "callback" in session){

				// to do remove from session object...
				var cb = session.callback;
				try{
					delete session.callback;
				}catch(e){}

				// Update store
				// Removing the callback
				hello.utils.store(name,session);

				// Emit global events
				try{
					window[cb](session);
				}
				catch(e){}
			}
			
			//
			// Refresh token
			//
			if( session && ("expires" in session) && session.expires < CURRENT_TIME ){

				// If auto refresh is possible
				// Either the browser supports 
				var refresh = provider.refresh || session.refresh_token;

				// Has the refresh been run recently?
				if( refresh && (!( name in expired ) || expired[name] < CURRENT_TIME ) ){
					// try to resignin
					hello.emit("notice", name + " has expired trying to resignin" );
					hello.login(name,{display:'none', force: false});

					// update expired, every 10 minutes
					expired[name] = CURRENT_TIME + 600;
				}

				// Does this provider not support refresh
				else if( !refresh && !( name in expired ) ) {
					// Label the event
					emit('expired');
					expired[name] = true;
				}

				// If session has expired then we dont want to store its value until it can be established that its been updated
				continue;
			}
			// Has session changed?
			else if( oldsess.access_token === session.access_token &&
						oldsess.expires === session.expires ){
				continue;
			}
			// Access_token has been removed
			else if( !session.access_token && oldsess.access_token ){
				emit('logout');
			}
			// Access_token has been created
			else if( session.access_token && !oldsess.access_token ){
				emit('login');
			}
			// Access_token has been updated
			else if( session.expires !== oldsess.expires ){
				emit('update');
			}

			// Updated stored session
			old_session[name] = session;

			// Remove the expired flags
			if(name in expired){
				delete expired[name];
			}
		}}

		// Check error events
		setTimeout(self, 1000);
	})();

})(hello);









// EOF CORE lib
//////////////////////////////////







/////////////////////////////////////////
// API
// @param path		string
// @param query		object (optional)
// @param method	string (optional)
// @param data		object (optional)
// @param timeout	integer (optional)
// @param callback	function (optional)

hello.api = function(){

	// Shorthand
	var self = this;
	var utils = self.utils;

	// Construct a new Promise object
	var promise = utils.Promise();

	// Arguments
	var p = utils.args({path:'s!', query : "o", method : "s", data:'o', timeout:'i', callback:"f" }, arguments);

	// method
	p.method = (p.method || 'get').toLowerCase();

	// headers
	p.headers = p.headers || {};

	// query
	p.query = p.query || {};

	// If get, put all parameters into query
	if( p.method === 'get' || p.method === 'delete' ){
		utils.extend( p.query, p.data );
		p.data = {};
	}

	// data
	var data = p.data = p.data || {};

	// Completed event
	// callback
	promise.then( p.callback, p.callback );


	// Path
	// Remove the network from path, e.g. facebook:/me/friends
	// results in { network : facebook, path : me/friends }
	if(!p.path){
		return promise.reject( error( 'invalid_path', 'Missing the path parameter from the request' ) );
	}
	p.path = p.path.replace(/^\/+/,'');
	var a = (p.path.split(/[\/\:]/,2)||[])[0].toLowerCase();

	if(a in self.services){
		p.network = a;
		var reg = new RegExp('^'+a+':?\/?');
		p.path = p.path.replace(reg,'');
	}


	// Network & Provider
	// Define the network that this request is made for
	p.network = self.settings.default_service = p.network || self.settings.default_service;
	var o = self.services[p.network];


	// INVALID
	// Is there no service by the given network name?
	if(!o){
		return promise.reject( error( "invalid_network", "Could not match the service requested: " + p.network) );
	}

	// PATH
	// as long as the path isn't flagged as unavaiable, e.g. path == false

	if( !( !(p.method in o) || !(p.path in o[p.method]) || o[p.method][p.path] !== false ) ){
		return promise.reject( error( 'invalid_path', 'The provided path is not available on the selected network') );
	}



	// PROXY
	// OAuth1 calls always need a proxy

	if(!p.oauth_proxy){
		p.oauth_proxy = self.settings.oauth_proxy;
	}
	if(!("proxy" in p)){
		p.proxy = p.oauth_proxy && o.oauth && parseInt(o.oauth.version,10) === 1;
	}
	


	// TIMEOUT
	// Adopt timeout from global settings by default

	if(!("timeout" in p)){
		p.timeout = self.settings.timeout;
	}



	//
	// Get the current session
	// Append the access_token to the query
	var session = self.getAuthResponse(p.network);
	if(session&&session.access_token){
		p.query.access_token = session.access_token;
	}



	var url = p.path, m;


	// Store the query as options
	// This is used to populate the request object before the data is augmented by the prewrap handlers.
	p.options = utils.clone(p.query);


	// Clone the data object
	// Prevent this script overwriting the data of the incoming object.
	// ensure that everytime we run an iteration the callbacks haven't removed some data
	p.data = utils.clone(data);


	// URL Mapping
	// Is there a map for the given URL?
	var actions = o[{"delete":"del"}[p.method]||p.method] || {};


	// Extrapolate the QueryString
	// Provide a clean path
	// Move the querystring into the data
	if(p.method==='get'){

		var query = url.split(/[\?#]/)[1];
		if(query){
			utils.extend( p.query, utils.param( query ));
			// Remove the query part from the URL
			url = url.replace(/\?.*?(#|$)/,'$1');
		}
	}


	// is the hash fragment defined
	if( ( m = url.match(/#(.+)/,'') ) ){
		url = url.split('#')[0];
		p.path = m[1];
	}
	else if( url in actions ){
		p.path = url;
		url = actions[ url ];
	}
	else if( 'default' in actions ){
		url = actions['default'];
	}



	// Redirect Handler
	// This defines for the Form+Iframe+Hash hack where to return the results too.
	p.redirect_uri = self.settings.redirect_uri;


	// Set OAuth settings
	p.oauth = o.oauth;


	// Define FormatHandler
	// The request can be procesed in a multitude of ways
	// Here's the options - depending on the browser and endpoint
	p.xhr = o.xhr;
	p.jsonp = o.jsonp;
	p.form = o.form;


	// Make request
	if( typeof(url) === 'function' ){
		// Does self have its own callback?
		url(p, getPath);
	}
	else{
		// Else the URL is a string
		getPath(url);
	}
	

	return promise.proxy;


	// if url needs a base
	// Wrap everything in
	function getPath(url){

		// Format the string if it needs it
		url = url.replace(/\@\{([a-z\_\-]+)(\|.+?)?\}/gi, function(m,key,defaults){
			var val = defaults ? defaults.replace(/^\|/,'') : '';
			if(key in p.query){
				val = p.query[key];
				delete p.query[key];
			}
			else if(!defaults){
				promise.reject( error( "missing_attribute", "The attribute " + key + " is missing from the request" ) );
			}
			return val;
		});


		// Add base
		if( !url.match(/^https?:\/\//) ){
			url = o.base + url;
		}

		// Define the request URL
		p.url = url;


		//
		// Make the HTTP request with the curated request object
		// CALLBACK HANDLER
		// @ response object
		// @ statusCode integer if available
		utils.request( p, function(r,headers){

			// Should this be an object
			if(r===true){
				r = {success:true};
			}
			else if(!r){
				r = {};
			}


			// the delete callback needs a better response
			if( p.method === 'delete' ){
				r = (!r||utils.isEmpty(r)) ? {success:true} : r;
			}


			// FORMAT RESPONSE?
			// Does self request have a corresponding formatter
			if( o.wrap && ( (p.path in o.wrap) || ("default" in o.wrap) )){
				var wrap = (p.path in o.wrap ? p.path : "default");
				var time = (new Date()).getTime();

				// FORMAT RESPONSE
				var b = o.wrap[wrap](r,headers,p);

				// Has the response been utterly overwritten?
				// Typically self augments the existing object.. but for those rare occassions
				if(b){
					r = b;
				}
			}


			// Is there a next_page defined in the response?
			if( r && "paging" in r && r.paging.next ){

				// Add the relative path if it is missing from the paging/next path
				if( r.paging.next[0] === '?' ){
					r.paging.next = p.path + r.paging.next;
				}
				// The relative path has been defined, lets markup the handler in the HashFragment
				else{
					r.paging.next += '#' + p.path;
				}
			}

			//
			// Dispatch to listeners
			// Emit events which pertain to the formatted response
			if(!r || "error" in r){
				promise.reject(r);
			}
			else{
				promise.fulfill(r);
			}
		});
	}


	// Error handling
	function error(code,message){
		return {
			error:{
				code:code,
				message:message
			}
		};
	}

};









///////////////////////////////////
// API Utilities
///////////////////////////////////

hello.utils.extend( hello.utils, {


	//
	// Make an HTTP request
	// 
	request : function( p, callback ){

		var utils = this;


		// This has too go through a POST request
		if( !utils.isEmpty( p.data ) && !("FileList" in window) && utils.hasBinary( p.data ) ){

			// Disable XHR and JSONP
			p.xhr = false;
			p.jsonp = false;

		}


		// XHR
		// Can we use XHR for Cross domain delivery?

		if(
			// Browser supports CORS
			'withCredentials' in new XMLHttpRequest() &&

			// ... now does the service support CORS?
			// p.xhr is undefined, true or a function which returns true
			( !("xhr" in p) || ( p.xhr && ( typeof(p.xhr)!=='function' || p.xhr( p, p.query ) ) ) )

			){


			// Format the URL and return it...

			formatUrl( p, function(url){

				var x = utils.xhr( p.method, url, p.headers, p.data, callback );

				// Set handlers
				x.onprogress = p.onprogress || null;

				// Windows Phone does not support xhr.upload, see #74
				// Feaure detect it...
				if( x.upload && p.onuploadprogress ){
					x.upload.onprogress = p.onuploadprogress;
				}

			});

			return;
		}


		// Clone the query object
		// Each request modifies the query object.
		// ... and needs to be tared after each one.
		var _query = p.query;

		p.query = utils.clone( p.query );


		// CALLBACK
		// Assign a new callbackID
		p.callbackID = utils.globalEvent();


		// JSONP

		if( p.jsonp !== false ){

			// Clone the query object
			p.query.callback = p.callbackID;

			// If the JSONP is a function then run it
			if( typeof( p.jsonp ) === 'function' ){

				p.jsonp( p, p.query );
			}

			// Lets use JSONP if the method is 'get'
			if( p.method === 'get' ){

				formatUrl( p, function( url ){

					utils.jsonp( url, callback, p.callbackID, p.timeout );

				});

				return;

			}
			else{
				// Its not compatible reset query
				p.query = _query;
			}

		}



		// Otherwise we're on to the old school, IFRAME hacks and JSONP

		if( p.form !== false ){

			// Add some additional query parameters to the URL
			// We're pretty stuffed if the endpoint doesn't like these

			p.query.redirect_uri = p.redirect_uri;
			p.query.state = JSON.stringify({callback:p.callbackID});

			var opts;

			if( typeof( p.form ) === 'function' ){

				// Format the request
				opts = p.form( p, p.query );
			}

			if( p.method === 'post' && opts !== false ){

				formatUrl( p, function( url ){

					utils.post( url, p.data, opts, callback, p.callbackID, p.timeout );

				});

				return;
			}
		}

		// None of the methods were successful throw an error
		callback({
			error:{
				code : 'invalid_request',
				message : 'There was no mechanism for handling this request'
			}
		});

		return;


		//
		// Format URL
		// Constructs the request URL, optionally wraps the URL through a call to a proxy server
		// Returns the formatted URL
		// 
		function formatUrl( p, callback ){

			// Are we signing the request?
			var sign;

			// OAuth1
			// Remove the token from the query before signing
			if( p.oauth && parseInt(p.oauth.version,10) === 1 ){

				// OAUTH SIGNING PROXY
				sign = p.query.access_token;

				// Remove the access_token
				delete p.query.access_token;

				// Enfore use of Proxy
				p.proxy = true;
			}


			// POST BODY to QueryString
			if( p.data && ( p.method === 'get' || p.method === 'delete' ) ){
				// Attach the p.data to the querystring.
				utils.extend( p.query, p.data );
				p.data = null;
			}


			// Construct the path
			var path = utils.qs( p.url, p.query );


			// Proxy the request through a server
			// Used for signing OAuth1
			// And circumventing services without Access-Control Headers
			if( p.proxy ){
				// Use the proxy as a path
				path = utils.qs( p.oauth_proxy, {
					path : path,
					access_token : sign||'', // This will prompt the request to be signed as though it is OAuth1
					then : (p.method.toLowerCase() === 'get' ? 'redirect' : 'proxy'),
					method : p.method.toLowerCase(),
					suppress_response_codes : true
				});
			}

			callback( path );
		}
	},




	//
	// isArray
	isArray : function (o){
		return Object.prototype.toString.call(o) === '[object Array]';
	},


	// _DOM
	// return the type of DOM object
	domInstance : function(type,data){
		var test = "HTML" + (type||'').replace(/^[a-z]/,function(m){return m.toUpperCase();}) + "Element";
		if( !data ){
			return false;
		}
		if(window[test]){
			return data instanceof window[test];
		}else if(window.Element){
			return data instanceof window.Element && (!type || (data.tagName&&data.tagName.toLowerCase() === type));
		}else{
			return (!(data instanceof Object||data instanceof Array||data instanceof String||data instanceof Number) && data.tagName && data.tagName.toLowerCase() === type );
		}
	},

	//
	// Clone
	// Create a clone of an object
	clone : function(obj){
		// Does not clone Dom elements, nor Binary data, e.g. Blobs, Filelists
		if( obj === null || typeof( obj ) !== 'object' || obj instanceof Date || "nodeName" in obj || this.isBinary( obj ) ){
			return obj;
		}
		var clone;
		if(this.isArray(obj)){
			clone = [];
			for(var i=0;i<obj.length;i++){
				clone.push(this.clone(obj[i]));
			}
			return clone;
		}

		// But does clone everything else.
		clone = {};
		for(var x in obj){
			clone[x] = this.clone(obj[x]);
		}
		return clone;
	},

	//
	// XHR
	// This uses CORS to make requests
	xhr : function(method, url, headers, data, callback){

		var utils = this;

		var r = new XMLHttpRequest();

		// Binary?
		var binary = false;
		if(method==='blob'){
			binary = method;
			method = 'GET';
		}
		// UPPER CASE
		method = method.toUpperCase();

		// xhr.responseType = "json"; // is not supported in any of the vendors yet.
		r.onload = function(e){
			var json = r.response;
			try{
				json = JSON.parse(r.responseText);
			}catch(_e){
				if(r.status===401){
					json = {
						error : {
							code : "access_denied",
							message : r.statusText
						}
					};
				}
			}
			var headers = headersToJSON(r.getAllResponseHeaders());
			headers.statusCode = r.status;

			callback( json || ( method==='GET' ? {error:{code:"empty_response",message:"Could not get resource"}} : {} ), headers );
		};
		r.onerror = function(e){
			var json = r.responseText;
			try{
				json = JSON.parse(r.responseText);
			}catch(_e){}

			callback(json||{error:{
				code: "access_denied",
				message: "Could not get resource"
			}});
		};

		var x;

		// Should we add the query to the URL?
		if(method === 'GET'||method === 'DELETE'){
			data = null;
		}
		else if( data && typeof(data) !== 'string' && !(data instanceof FormData) && !(data instanceof File) && !(data instanceof Blob)){
			// Loop through and add formData
			var f = new FormData();
			for( x in data )if(data.hasOwnProperty(x)){
				if( data[x] instanceof HTMLInputElement ){
					if( "files" in data[x] && data[x].files.length > 0){
						f.append(x, data[x].files[0]);
					}
				}
				else if(data[x] instanceof Blob){
					f.append(x, data[x], data.name);
				}
				else{
					f.append(x, data[x]);
				}
			}
			data = f;
		}


		// Open the path, async
		r.open( method, url, true );

		if(binary){
			if("responseType" in r){
				r.responseType = binary;
			}
			else{
				r.overrideMimeType("text/plain; charset=x-user-defined");
			}
		}

		// Set any bespoke headers
		if(headers){
			for( x in headers){
				r.setRequestHeader( x, headers[x]);
			}
		}

		r.send( data );


		return r;


		//
		// headersToJSON
		// Headers are returned as a string, which isn't all that great... is it?
		function headersToJSON(s){
			var r = {};
			var reg = /([a-z\-]+):\s?(.*);?/gi,
				m;
			while((m = reg.exec(s))){
				r[m[1]] = m[2];
			}
			return r;
		}
	},


	//
	// JSONP
	// Injects a script tag into the dom to be executed and appends a callback function to the window object
	// @param string/function pathFunc either a string of the URL or a callback function pathFunc(querystringhash, continueFunc);
	// @param function callback a function to call on completion;
	//
	jsonp : function(url,callback,callbackID,timeout){

		var utils = this;

		// Change the name of the callback
		var bool = 0,
			head = document.getElementsByTagName('head')[0],
			operafix,
			script,
			result = {error:{message:'server_error',code:'server_error'}},
			cb = function(){
				if( !( bool++ ) ){
					window.setTimeout(function(){
						callback(result);
						head.removeChild(script);
					},0);
				}
			};

		// Add callback to the window object
		callbackID = utils.globalEvent(function(json){
			result = json;
			return true; // mark callback as done
		},callbackID);

		// The URL is a function for some cases and as such
		// Determine its value with a callback containing the new parameters of this function.
		url = url.replace(new RegExp("=\\?(&|$)"),'='+callbackID+'$1');


		// Build script tag
		script = utils.append('script',{
			id:callbackID,
			name:callbackID,
			src: url,
			async:true,
			onload:cb,
			onerror:cb,
			onreadystatechange : function(){
				if(/loaded|complete/i.test(this.readyState)){
					cb();
				}
			}
		});

		// Opera fix error
		// Problem: If an error occurs with script loading Opera fails to trigger the script.onerror handler we specified
		// Fix:
		// By setting the request to synchronous we can trigger the error handler when all else fails.
		// This action will be ignored if we've already called the callback handler "cb" with a successful onload event
		if( window.navigator.userAgent.toLowerCase().indexOf('opera') > -1 ){
			operafix = utils.append('script',{
				text:"document.getElementById('"+cb_name+"').onerror();"
			});
			script.async = false;
		}

		// Add timeout
		if(timeout){
			window.setTimeout(function(){
				result = {error:{message:'timeout',code:'timeout'}};
				cb();
			}, timeout);
		}

		// Todo:
		// Add fix for msie,
		// However: unable recreate the bug of firing off the onreadystatechange before the script content has been executed and the value of "result" has been defined.
		// Inject script tag into the head element
		head.appendChild(script);
		
		// Append Opera Fix to run after our script
		if(operafix){
			head.appendChild(operafix);
		}
	},


	//
	// Post
	// Send information to a remote location using the post mechanism
	// @param string uri path
	// @param object data, key value data to send
	// @param function callback, function to execute in response
	//
	post : function(url, data, options, callback, callbackID, timeout){

		var utils = this,
			doc = document;


		// This hack needs a form
		var form = null,
			reenableAfterSubmit = [],
			newform,
			i = 0,
			x = null,
			bool = 0,
			cb = function(r){
				if( !( bool++ ) ){

					// fire the callback
					callback(r);

					// Do not return true, as that will remove the listeners
					// return true;
				}
			};

		// What is the name of the callback to contain
		// We'll also use this to name the iFrame
		utils.globalEvent(cb, callbackID);

		// Build the iframe window
		var win;
		try{
			// IE7 hack, only lets us define the name here, not later.
			win = doc.createElement('<iframe name="'+callbackID+'">');
		}
		catch(e){
			win = doc.createElement('iframe');
		}

		win.name = callbackID;
		win.id = callbackID;
		win.style.display = 'none';

		// Override callback mechanism. Triggger a response onload/onerror
		if(options&&options.callbackonload){
			// onload is being fired twice
			win.onload = function(){
				cb({
					response : "posted",
					message : "Content was posted"
				});
			};
		}

		if(timeout){
			setTimeout(function(){
				cb({
					error : {
						code:"timeout",
						message : "The post operation timed out"
					}
				});
			}, timeout);
		}

		doc.body.appendChild(win);


		// if we are just posting a single item
		if( utils.domInstance('form', data) ){
			// get the parent form
			form = data.form;
			// Loop through and disable all of its siblings
			for( i = 0; i < form.elements.length; i++ ){
				if(form.elements[i] !== data){
					form.elements[i].setAttribute('disabled',true);
				}
			}
			// Move the focus to the form
			data = form;
		}

		// Posting a form
		if( utils.domInstance('form', data) ){
			// This is a form element
			form = data;

			// Does this form need to be a multipart form?
			for( i = 0; i < form.elements.length; i++ ){
				if(!form.elements[i].disabled && form.elements[i].type === 'file'){
					form.encoding = form.enctype = "multipart/form-data";
					form.elements[i].setAttribute('name', 'file');
				}
			}
		}
		else{
			// Its not a form element,
			// Therefore it must be a JSON object of Key=>Value or Key=>Element
			// If anyone of those values are a input type=file we shall shall insert its siblings into the form for which it belongs.
			for(x in data) if(data.hasOwnProperty(x)){
				// is this an input Element?
				if( utils.domInstance('input', data[x]) && data[x].type === 'file' ){
					form = data[x].form;
					form.encoding = form.enctype = "multipart/form-data";
				}
			}

			// Do If there is no defined form element, lets create one.
			if(!form){
				// Build form
				form = doc.createElement('form');
				doc.body.appendChild(form);
				newform = form;
			}

			var input;

			// Add elements to the form if they dont exist
			for(x in data) if(data.hasOwnProperty(x)){

				// Is this an element?
				var el = ( utils.domInstance('input', data[x]) || utils.domInstance('textArea', data[x]) || utils.domInstance('select', data[x]) );

				// is this not an input element, or one that exists outside the form.
				if( !el || data[x].form !== form ){

					// Does an element have the same name?
					var inputs = form.elements[x];
					if(input){
						// Remove it.
						if(!(inputs instanceof NodeList)){
							inputs = [inputs];
						}
						for(i=0;i<inputs.length;i++){
							inputs[i].parentNode.removeChild(inputs[i]);
						}

					}

					// Create an input element
					input = doc.createElement('input');
					input.setAttribute('type', 'hidden');
					input.setAttribute('name', x);

					// Does it have a value attribute?
					if(el){
						input.value = data[x].value;
					}
					else if( utils.domInstance(null, data[x]) ){
						input.value = data[x].innerHTML || data[x].innerText;
					}else{
						input.value = data[x];
					}

					form.appendChild(input);
				}
				// it is an element, which exists within the form, but the name is wrong
				else if( el && data[x].name !== x){
					data[x].setAttribute('name', x);
					data[x].name = x;
				}
			}

			// Disable elements from within the form if they weren't specified
			for(i=0;i<form.elements.length;i++){

				input = form.elements[i];

				// Does the same name and value exist in the parent
				if( !( input.name in data ) && input.getAttribute('disabled') !== true ) {
					// disable
					input.setAttribute('disabled',true);

					// add re-enable to callback
					reenableAfterSubmit.push(input);
				}
			}
		}


		// Set the target of the form
		form.setAttribute('method', 'POST');
		form.setAttribute('target', callbackID);
		form.target = callbackID;



		// Update the form URL
		form.setAttribute('action', url);

		// Submit the form
		// Some reason this needs to be offset from the current window execution
		setTimeout(function(){
			form.submit();

			setTimeout(function(){
				try{
					// remove the iframe from the page.
					//win.parentNode.removeChild(win);
					// remove the form
					if(newform){
						newform.parentNode.removeChild(newform);
					}
				}
				catch(e){
					try{
						console.error("HelloJS: could not remove iframe");
					}
					catch(ee){}
				}

				// reenable the disabled form
				for(var i=0;i<reenableAfterSubmit.length;i++){
					if(reenableAfterSubmit[i]){
						reenableAfterSubmit[i].setAttribute('disabled', false);
						reenableAfterSubmit[i].disabled = false;
					}
				}
			},0);
		},100);

		// Build an iFrame and inject it into the DOM
		//var ifm = _append('iframe',{id:'_'+Math.round(Math.random()*1e9), style:shy});
		
		// Build an HTML form, with a target attribute as the ID of the iFrame, and inject it into the DOM.
		//var frm = _append('form',{ method: 'post', action: uri, target: ifm.id, style:shy});

		// _append('input',{ name: x, value: data[x] }, frm);
	},


	//
	// Some of the providers require that only MultiPart is used with non-binary forms.
	// This function checks whether the form contains binary data
	hasBinary : function (data){
		for(var x in data ) if(data.hasOwnProperty(x)){
			if( this.isBinary(data[x]) ){
				return true;
			}
		}
		return false;
	},


	// Determines if a variable Either Is or like a FormInput has the value of a Blob

	isBinary : function(data){

		return data instanceof Object && (
				(this.domInstance('input', data) && data.type === 'file') ||
				("FileList" in window && data instanceof window.FileList) ||
				("File" in window && data instanceof window.File) ||
				("Blob" in window && data instanceof window.Blob));

	},


	// DataURI to Blob
	// Converts a Data-URI to a Blob string
	
	toBlob : function(dataURI){
		var reg = /^data\:([^;,]+(\;charset=[^;,]+)?)(\;base64)?,/i;
		var m = dataURI.match(reg);
		if(!m){
			return dataURI;
		}
		var binary = atob(dataURI.replace(reg,''));
		var array = [];
		for(var i = 0; i < binary.length; i++) {
			array.push(binary.charCodeAt(i));
		}
		return new Blob([new Uint8Array(array)], {type: m[1]});
	}

});





//
// EXTRA: Convert FORMElements to JSON for POSTING
// Wrappers to add additional functionality to existing functions
//
(function(hello){
	// Copy original function
	var api = hello.api;
	var utils = hello.utils;

utils.extend(utils, {
	//
	// dataToJSON
	// This takes a FormElement|NodeList|InputElement|MixedObjects and convers the data object to JSON.
	//
	dataToJSON : function (p){

		var utils = this,
			w = window;

		var data = p.data;

		// Is data a form object
		if( utils.domInstance('form', data) ){

			data = utils.nodeListToJSON(data.elements);

		}
		else if ( "NodeList" in w && data instanceof NodeList ){

			data = utils.nodeListToJSON(data);

		}
		else if( utils.domInstance('input', data) ){

			data = utils.nodeListToJSON( [ data ] );

		}

		// Is data a blob, File, FileList?
		if( ("File" in w && data instanceof w.File) ||
			("Blob" in w && data instanceof w.Blob) ||
			("FileList" in w && data instanceof w.FileList) ){

			// Convert to a JSON object
			data = {'file' : data};
		}

		// Loop through data if its not FormData it must now be a JSON object
		if( !( "FormData" in w && data instanceof w.FormData ) ){

			// Loop through the object
			for(var x in data) if(data.hasOwnProperty(x)){

				// FileList Object?
				if("FileList" in w && data[x] instanceof w.FileList){
					// Get first record only
					if(data[x].length===1){
						data[x] = data[x][0];
					}
					else{
						//("We were expecting the FileList to contain one file");
					}
				}
				else if( utils.domInstance('input', data[x]) && data[x].type === 'file' ){
					// ignore
					continue;
				}
				else if( utils.domInstance('input', data[x]) ||
					utils.domInstance('select', data[x]) ||
					utils.domInstance('textArea', data[x])
					){
					data[x] = data[x].value;
				}
				// Else is this another kind of element?
				else if( utils.domInstance(null, data[x]) ){
					data[x] = data[x].innerHTML || data[x].innerText;
				}
			}
		}

		// Data has been converted to JSON.
		p.data = data;
		return data;
	},


	//
	// NodeListToJSON
	// Given a list of elements extrapolate their values and return as a json object
	nodeListToJSON : function(nodelist){

		var json = {};

		// Create a data string
		for(var i=0;i<nodelist.length;i++){

			var input = nodelist[i];

			// If the name of the input is empty or diabled, dont add it.
			if(input.disabled||!input.name){
				continue;
			}

			// Is this a file, does the browser not support 'files' and 'FormData'?
			if( input.type === 'file' ){
				json[ input.name ] = input;
			}
			else{
				json[ input.name ] = input.value || input.innerHTML;
			}
		}

		return json;
	}
});


	// Replace it
	hello.api = function(){
		// get arguments
		var p = utils.args({path:'s!', method : "s", data:'o', timeout:'i', callback:"f" }, arguments);
		// Change for into a data object
		if(p.data){
			utils.dataToJSON(p);
		}
		// Continue
		return api.call(this, p);
	};

})(hello);






// MDN
// Polyfill IE8, does not support native Function.bind

if (!Function.prototype.bind) {
	Function.prototype.bind=function(b){
		if(typeof this!=="function"){
			throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
		}
		function c(){}
		var a=[].slice,
			f=a.call(arguments,1),
			e=this,
			d=function(){
				return e.apply(this instanceof c?this:b||window,f.concat(a.call(arguments)));
			};
			c.prototype=this.prototype;
			d.prototype=new c();
		return d;
	};
}

// hello.legacy.js

// Shimming old deprecated functions
hello.subscribe = hello.on;
hello.trigger = hello.emit;
hello.unsubscribe = hello.off;

//
// AMD shim
//
if (typeof define === 'function' && define.amd) {
	// AMD. Register as an anonymous module.
	define(function(){
		return hello;
	});
}

//
// CommonJS module for browserify
//
if (typeof module === 'object' && module.exports) {
  // CommonJS definition
  module.exports = hello;
}
