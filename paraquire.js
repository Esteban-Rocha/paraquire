// This file geerates callable `paraquire` function.
// Functions in this file does not have direct access to builtin modules,
// except two cases:
// 1. Access through `t = require('./paraquire-tools.js')`
// 2. Access through regular `require`, when builtins are passed to paraquired library
// Thus, when `paraquire` is `require`d in other `paraquire` jail,
// there shouldn't be privilege escalation in this file

'use strict';
var t = require('./paraquire-tools.js');

// Simple function to log without errors if console is not permitted
// (for example, into cascade paraquire)
function dbg(a,b,c){
	try {
		console.log(a,b,c);
	} catch (error) {
		// We can do nothing :-(
	}
}

function generateRequire(_sandbox, permissions, moduleFile, parent){
	if(!permissions){
		permissions = {};
	}
	// moduleFile is always full path to file
	// TODO: can "index.js" be omitted? I don't know
	// dbg("moduleFile in generateRequire: " + moduleFile);
	return function(_request) {
		//console.log('Requiring ' + _request);
		if (t.isBuiltin(_request)){
			if (permissions.builtin && permissions.builtin[_request]) {
				return require(_request);
			} else {
				if(permissions.builtinErrors){
					throw new Error(
						'Not permitted to require builtin module \'' + _request + '\'');
				}
				// Returning a string seems to be useful
				// Usually a library requires all essentive modules during initializations
				// So that if we throw an Error, paraquired library could not initialize
				// On the other hand,
				// actual use of required builtins is often contained in functions,
				// I.e. if we do not call functions using forbidden builtin,
				// we will not have an Error and
				// the library will be working without dangerous permissions.
				// Make sure that you have good tests for your project ;-)
				return 'Forbidden: ' + _request;
			}
		} // de-facto else
		if(t.isJSON(_request)){
			if(permissions.requiringJSON !== false){
				var childFile = t.resolveChildRequest(moduleFile, _request);
				return require(childFile);
			} else {
				throw new Error("Not permitted to require JSON file '" + _request + "'");
			}
		} // de-facto else
		if (t.isBinaryAddon(_request)) {
			if (permissions.binaryAddons === 'all') {
				//TODO: с этого места поподробнее, предусмотреть не только 'all'
				return require(_request); // TODO: is the name resolved properly?
			} else {
				throw new Error('Not permitted to require binary addon \'' + _request + '\'');
			}
		} else {
			//TODO: don't do this work every time, use closures
			var childFile = t.resolveChildRequest(moduleFile, _request);
			//dbg(moduleFile, childFile, _request);
			//dbg(t.ownMainFileName, t.ownToolsFileName);
			if (
				moduleFile === t.ownMainFileName
			&&
				childFile === t.ownToolsFileName
			&&
				//TODO: unhardcode?
				_request === './paraquire-tools.js'
			){
				// If `paraquire` runs in another `paraquire` jail,
				// it normally should not have access to `fs`, `path` and `vm`.
				// But paraquire needs thie access.
				// So, when this function is called from this file
				// requiring `./paraquire-tools.js`,
				// and only in that case,
				// `./paraquire-tools.js` with full permissions is returned.
				// It seems to be safe to do this, because this file
				// remains running into jail with partial permissions,
				// so all `require`, `console`, `process`, etc. references
				// go to upper `paraquire` instance.

				return t;
			}
			return runFile(childFile, _sandbox, permissions, parent);
		}
	};
}


function paraquire(request, permissions, parent) {
	var sandbox = t.createSandbox();

	if(permissions) {
		if (permissions.builtin && permissions.builtin[0]) {
			//We cannot use instanceof Array or smth like this
			var builtinObj={};
			permissions.builtin.map(function(b){builtinObj[b]=true});
			permissions.builtin = builtinObj;
		}

		if(permissions.globals_s || permissions.globalsSafe) {
			[
				'Buffer',
				'clearImmediate',
				'clearInterval',
				'clearTimeout',
				'setImmediate',
				'setInterval',
				'setTimeout',
			].map(function(g){sandbox[g] = sandbox.global[g] = global[g]});
		}

		if(permissions.sandbox) {
			for (var prop in permissions.sandbox) {
				sandbox[prop] = permissions.sandbox[prop];
			}
		} else {
			permissions.sandbox = {};
		}

		if(permissions.process){
			if(permissions.sandbox.process){
				throw new Error("Specifying both permissions.process and permissions.sandbox.process is forbidden");
			}
			sandbox.process={};
			permissions.process.map(function(b){sandbox.process[b]=process[b]});
		}
		if(permissions['process.env']){
			if(permissions.sandbox.process){
				throw new Error(
					"Specifying both permissions.process and permissions['process.env'] is forbidden"
				);
			}
			if(permissions.sandbox.process && permissions.sandbox.process.indexOf('env') !== -1){ //TODO: test
				throw new Error(
					"Specifying both permissions.process.env and permissions['process.env'] is forbidden"
				);
			}
			sandbox.process = sandbox.process || {};
			sandbox.process.env = {};
			permissions['process.env'].map(function(b){sandbox.process.env[b]=process.env[b]});
		}
		if(permissions.console){
			if(permissions.sandbox.console){
				throw new Error("Specifying both permissions.console and permissions.sandbox.console is forbidden");
			}
			if(permissions.console === true){
				sandbox.console=console;
			} else {
				sandbox.console={};				
				permissions.console.map(function(b){sandbox.console[b]=console[b]});
			}
		}
		if(permissions.Buffer){
			if(permissions.sandbox.Buffer){
				throw new Error("Specifying both permissions.Buffer and permissions.sandbox.Buffer is forbidden");
			}
			sandbox.Buffer=Buffer;
		}
	}

//	dbg('parent in paraquire():');
//	dbg(parent);
//	dbg(parent.filename);
	var moduleFile = t.resolveChildRequest(parent.filename, request);

	return runFile(moduleFile, sandbox, permissions, parent);
}

function runFile(moduleFile, sandbox, permissions, parent){
	// moduleFile - full path to file which shoul be runned
	// sandbox - context in which the file should be runned
	// permissions - permissions object with which the file shoul be runned
	// parent - module which is parent to running file
	if (!permissions){
		permissions = {};
	}

	if (!permissions._cache){
		permissions._cache = {};
	}

	if (moduleFile in permissions._cache){
		return permissions._cache[moduleFile].exports;
	}
	
	var moduleContents = t.getScript(moduleFile);

	var premodule = moduleContents.runInContext(sandbox);
	var returnedExports = {};
	var returnedModule = {
		exports: returnedExports,
		filename: moduleFile,
	};
	permissions._cache[moduleFile] = returnedModule;

	if (permissions.parent) {
		// TODO: tests
		returnedModule.parent = parent;
	}
	premodule(
		generateRequire(sandbox, permissions, moduleFile, returnedModule),
		returnedModule,
		returnedExports
	);
	return returnedModule.exports;
}



/*
//paraquire('./evil-lib.js')()();

//var crypto = paraquire('crypto');
*/
/*
var uniqueSlug = paraquire('unique-slug', {'crypto': true});

var randomSlug = uniqueSlug();
var fileSlug = uniqueSlug('/etc/passwd');

console.log(randomSlug,fileSlug);

paraquire('./lib-with-global-1');
*/


function generateParaquireByParent (parent, options) {
	return function(request, permissions) {
		if (!options) {
			options = {};
		}
		if (options && options.require && options.inherit && arguments.length === 1) {
			// Use regular require
			return options.require(request);
		}
		return paraquire(request, permissions, parent);
	}
}

module.exports = generateParaquireByParent;
