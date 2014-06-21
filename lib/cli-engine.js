/**
 * @fileoverview Main CLI object.
 * @author Nicholas C. Zakas
 */

"use strict";

/*
 * The CLI object should *not* call process.exit() directly. It should only return
 * exit codes. This allows other programs to use the CLI object and still control
 * when the program exits.
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var fs = require("fs"),
    path = require("path"),

    assign = require("object-assign"),
    debug = require("debug"),
    minimatch = require("minimatch"),

    rules = require("./rules"),
    eslint = require("./eslint"),
    traverse = require("./util/traverse"),
    Config = require("./config");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * The options to configure a CLI engine with.
 * @typedef {Object} CLIEngineOptions
 * @property {string} configFile The configuration file to use.
 * @property {boolean} reset True disables all default rules and environments.
 * @property {boolean} ignore False disables use of .eslintignore.
 * @property {string[]} rulePaths An array of directories to load custom rules from.
 * @property {boolean} useEslintrc False disables looking for .eslintrc
 * @property {string[]} envs An array of environments to load.
 * @property {string[]} globals An array of global variables to declare.
 * @property {Object<string,*>} rules An object of rules to use.
 * @property {string} ignorePath The ignore file to use instead of .eslintignore.
 */

/**
 * A linting warning or error.
 * @typedef {Object} LintMessage
 * @property {string} message The message to display to the user.
 */

/**
 * A linting result.
 * @typedef {Object} LintResult
 * @property {string} filePath The path to the file that was linted.
 * @property {LintMessage[]} messages All of the messages for the result.
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

debug = debug("eslint:cli-engine");

/**
 * Determines if a file or directory should be excluded from traversal.
 * @param {string} name The path name to check.
 * @param {string[]} exclude The paths to exclude.
 * @returns {boolean} True if the file should be excluded, false if not.
 * @private
 */
function isExcluded(name, exclude) {
    name = name.replace("\\", "/");
    return exclude.some(function(exclusion) {
        var result = minimatch(name, exclusion);
        debug("Minimatch " + result);
        return result;
    });
}

/**
 * Processes an individual file using ESLint.
 * @param {string} filename The filename of the file being checked.
 * @param {Object} configHelper The configuration options for ESLint.
 * @returns {Result} The results for linting on this file.
 * @private
 */
function processFile(filename, configHelper) {

    // clear all existing settings for a new file
    eslint.reset();

    var filePath = path.resolve(filename),
        config,
        text,
        messages;

    if (fs.existsSync(filePath)) {
        debug("Linting " + filePath);
        config = configHelper.getConfig(filePath);
        text = fs.readFileSync(path.resolve(filename), "utf8");
        messages = eslint.verify(text, config, filename);
    } else {
        debug("Couldn't find " + filePath);
        messages = [{
            fatal: true,
            message: "Could not find file at '" + filePath + "'."
        }];
    }

    return {
        filePath: filename,
        messages: messages
    };
}

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------


var defaultOptions = {
    configFile: null,
    reset: false,
    rulePaths: [],
    useEslintrc: true,
    envs: [],
    globals: [],
    rules: {},
    ignore: true,
    ignorePath: null
};

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Creates a new instance of the core CLI engine.
 * @param {CLIEngineOptions} options The options for this instance.
 * @constructor
 */
function CLIEngine(options) {

    /**
     * Stored options for this instance
     * @type {Object}
     */
    this.options = assign(Object.create(defaultOptions), options || {});

    // load in additional rules
    if (this.options.rulePaths) {
        this.options.rulePaths.forEach(function(rulesdir) {
            debug("Loading rules from " + rulesdir);
            rules.load(rulesdir);
        });
    }
}

CLIEngine.prototype = {

    constructor: CLIEngine,

    executeOnFiles: function(files) {

        var results = [],
            configHelper = new Config(this.options),
            exclusions = configHelper.getExclusions();

        traverse({
            files: files
        }, function(filename) {

            debug("Processing " + filename);

            if (path.extname(filename) === ".js") {

                if (!this.options.ignore || !isExcluded(filename, exclusions)) {
                    results.push(processFile(filename, configHelper));
                } else if (files.indexOf(filename) > -1) {

                    debug("Ignoring " + filename);

                    // only warn for files explicitly passes on the command line
                    results.push({
                        filePath: filename,
                        messages: [
                            {
                                fatal: false,
                                message: "File ignored because of your .eslintignore file. Use --no-ignore to override."
                            }
                        ]
                    });
                }
            }

        }.bind(this));

        return {
            results: results
        };
    }

};

module.exports = CLIEngine;
