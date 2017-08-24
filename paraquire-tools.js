'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const Module = require('module');

var scriptcache = {};

function createSandbox(){
	var sandbox = {
		global:{},
	};

	vm.createContext(sandbox);
	return sandbox;
}

function getScript(moduleFile){
	if (!(moduleFile in scriptcache)){
		scriptcache[moduleFile] = new vm.Script(
			"(function(require, module){" +
				fs.readFileSync(moduleFile, 'utf8') +
			"})",
			{filename:moduleFile}
		)
	}
	return scriptcache[moduleFile];
}

function isBinaryAddon(name) {
	return /\.node$/i.test(name);
}

// From: https://github.com/nodejs/node/issues/3307#issuecomment-185734608
function isBuiltin(module) {
	try {
		const resolved = require.resolve(module);
		return !resolved.includes(path.sep);
	} catch(e) {
		return false;
	}
}

function resolveChildRequest(moduleFile, _request){
	var dirname = path.dirname(moduleFile);
	var paths = Module._nodeModulePaths(dirname);
	//TODO: don't do this work every time, use closures
	paths.unshift(dirname);
	var parent = {
		paths: paths,
		id: moduleFile,
		filename: moduleFile,
	};
	return Module._resolveFilename(_request, parent, false);

}

function resolveModuleRequest(request, parent){
	return Module._resolveFilename(request, parent, false);
}

module.exports = {
    createSandbox: createSandbox,
    getScript: getScript,
    isBinaryAddon: isBinaryAddon,
    isBuiltin: isBuiltin,
    resolveChildRequest: resolveChildRequest,
    resolveModuleRequest: resolveModuleRequest,
}