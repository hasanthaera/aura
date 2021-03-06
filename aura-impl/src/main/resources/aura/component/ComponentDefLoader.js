/*
 * Copyright (C) 2013 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Handles retrieval of ComponentDefs from the server
 * @constructor
 */
function ComponentDefLoader() {
    this.pending = null;
    this.loading = 0;
    this.counter = 0;
}

// params start with "_" to avoid namespace collisions
ComponentDefLoader.APP_param = "aura.app";
ComponentDefLoader.FORFMFACTOR_param = "_ff";
ComponentDefLoader.LOCKER_param = "_l";
ComponentDefLoader.LOCALE_param = "_l10n";
ComponentDefLoader.STYLE_param = "_style";
ComponentDefLoader.DESCRIPTOR_param = "_def";
ComponentDefLoader.UID_param = "_uid";

ComponentDefLoader.UID_default = "LATEST";
ComponentDefLoader.BASE_PATH = "/auraCmpDef?";
ComponentDefLoader.MARKUP = "markup://";

ComponentDefLoader.prototype.buildURIAppParam = function() {
    return ComponentDefLoader.APP_param + "=" + ComponentDefLoader.MARKUP + $A.getRoot().getType();
};

ComponentDefLoader.prototype.buildFormFactorParam = function() {
    return "&" + ComponentDefLoader.FORFMFACTOR_param + "=" + $A.get("$Browser.formFactor");
};

ComponentDefLoader.prototype.buildURILockerParam = function() {
    return "&" + ComponentDefLoader.LOCKER_param + "=" + $A.lockerService.isEnabled();
};

ComponentDefLoader.prototype.buildURIStyleParam = function() {
    var cuid = $A.getContext().styleContext.cuid;
    return cuid ? "&" + ComponentDefLoader.STYLE_param + "=" + cuid : "";
};

ComponentDefLoader.prototype.buildURILocaleParam = function() {
    var locale = $A.get("$Locale.langLocale");
    return locale ? "&" + ComponentDefLoader.LOCALE_param + "=" + locale : "";
};

ComponentDefLoader.prototype.buildBundleComponentNamespace = function(descriptors, descriptorMap) {
    if (!$A.util.isArray(descriptors)) {
        //Should we return an empty object here or raise an error?
        return {};
    }
    var namespaceMap = {};
    for (var i=0; i < descriptors.length; i++) {
        if ($A.componentService.hasCacheableDefinitionOfAnyType(descriptors[i])) {
            continue;
        }
        var descriptor = new Aura.System.DefDescriptor(descriptors[i]);
        if (!(descriptor.getNamespace() in namespaceMap)) {
            namespaceMap[descriptor.getNamespace()] = {};
        }
        if ($A.util.isUndefinedOrNull(namespaceMap[descriptor.getNamespace()][descriptor.getName()])) {
            namespaceMap[descriptor.getNamespace()][descriptor.getName()] = descriptorMap[descriptors[i]];
        }
    }

    return namespaceMap;
};

ComponentDefLoader.prototype.buildBundleComponentUri = function(descriptorMap) {
    var descriptors = Object.keys(descriptorMap);
    var namespaceMap = this.buildBundleComponentNamespace(descriptors, descriptorMap);

    var baseURI = ComponentDefLoader.BASE_PATH + this.buildURIAppParam();

    baseURI += this.buildFormFactorParam();
    baseURI += this.buildURILockerParam();
    baseURI += this.buildURILocaleParam();
    baseURI += this.buildURIStyleParam();

    var uri = "";
    var uris = [];
    var hasRestrictedNamespaces = false;

    var uid = "";
    var namespaces = Object.keys(namespaceMap).sort();
    if (namespaces.length === 0) {
        return uris;
    }

    var maxLength;
    if ($A.util.isIE) {
        // URI length for IE needs to be below 2000 characters.
        maxLength = 1800;
    } else {
        // Commonly, app servers are configured with a request header size of 16k
        //   this includes URL and any additional Headers, like Cookies
        //   initially buffering for standard headers Accept*, Host, Referrer, Connection.
        // This information can vary, reducing the size further to help ensure we stay under the limit
        maxLength = 15000 - document.cookie.length - window.navigator.userAgent.length;
    }

    for (var i=0; i<namespaces.length; i++) {
        var isRestrictedNamespace = !($A.clientService.isInternalNamespace(namespaces[i]) || $A.clientService.isPrivilegedNamespace(namespaces[i]));
        if (isRestrictedNamespace) {
            hasRestrictedNamespaces = true;
        }
        var names = Object.keys(namespaceMap[namespaces[i]]).sort();
        var additionalURI = "&" + namespaces[i] + "=" + names.join(",");
        if (additionalURI.length + uri.length > maxLength) {
            if (additionalURI.length > maxLength) {
                additionalURI = "&" + namespaces[i] + "=";
                for (var name_idx=0; name_idx < names.length; name_idx++) {
                    var name = names[name_idx];
                    if (additionalURI.length + name.length + uri.length > maxLength) {
                        uri += additionalURI;
                        uris.push([uri, uid, hasRestrictedNamespaces]);
                        uid = $A.util.isString(namespaceMap[namespaces[i]][name]) ?  namespaceMap[namespaces[i]][name] : "";
                        additionalURI =  "&" + namespaces[i] + "=" + name;
                        uri = "";
                        hasRestrictedNamespaces = isRestrictedNamespace;
                    } else {
                        additionalURI += (name_idx>0?",":"") + name;
                        var additional_def_uid = namespaceMap[namespaces[i]][name];
                        if ($A.util.isString(additional_def_uid)) {
                            uid += additional_def_uid;
                        }
                    }
                }
                uri = additionalURI;
                names.length = 0;
            } else {
                uris.push([uri, uid, hasRestrictedNamespaces]);
                uid = "";
                uri = additionalURI;
                hasRestrictedNamespaces = isRestrictedNamespace;
            }
        } else {
            uri += additionalURI;
        }
        for (var j=0; j < names.length; j++) {
            var def_uid = namespaceMap[namespaces[i]][names[j]];
            if ($A.util.isString(def_uid)) {
                uid += def_uid;
            }
        }
    }

    uris.push([uri, uid, hasRestrictedNamespaces]);

    var processedURI = [];
    for(var def=0; def<uris.length; def++) {
        var finalURI = this.buildURIString(uris[def][0], uris[def][1], descriptors);
        Aura["componentDefLoaderError"][finalURI.uid] = [];
        var host = $A.clientService._host;
        if (!uris[def][2]) {
            host = $A.getContext().cdnHost || host;
        }
        processedURI.push(host + baseURI + finalURI.uriString);
    }
    return processedURI;
};

ComponentDefLoader.prototype.buildURIString = function(uri, uid, descriptors) {
    if (!uid.length) {
        uid = ComponentDefLoader.UID_default + "-" + (this.counter++);
    } else if (descriptors.length > 1) {
        uid = $A.util.getHashCode(uid);
    }

    return {uriString: uri + "&" + ComponentDefLoader.UID_param + "=" + uid, uid: uid};
};

ComponentDefLoader.prototype.getScriptPromises = function(descriptorMap) {
    var scriptPromises = [];
    var URIs = this.buildBundleComponentUri(descriptorMap);
    for (var idx=0; idx < URIs.length; idx++) {
        scriptPromises.push(this.generateScriptTag(URIs[idx]));
    }
    return scriptPromises;
};

ComponentDefLoader.prototype.retrievePending = function(pending) {
    //DQ TODO: Need to either review what is passed in (`pending`) or harden
    //how the object is used. A lot of assumptions about the shape of `pending` here.
    var scriptPromises = this.getScriptPromises(pending.descriptorMap);
    this.loading++;
    var that = this;

    Promise["all"](scriptPromises)["then"](function(){
        for (var j = 0; j < pending.callbacks.length; j++) {
            var scope = {idx:j, total:pending.callbacks.length, remaining:pending.callbacks.length-j-1};
            try {
                pending.callbacks[j].call(scope);
            } catch (e) {
                var errorMessage = e.message ? e.message : "Error in callback provided to component creation.";
                $A.reportError(errorMessage, e);
            }
        }
        that.loading--;
    }, function(e){
        for (var j = 0, p_length = pending.callbacks.length; j < p_length; j++) {
            try {
                // all callbacks get the error if only one errors, we aren't tracking which def was for which callback
                pending.callbacks[j](e);
            } catch (callbackError) {
                var errorMessage = callbackError.message ? callbackError.message : "Error in callback provided to component creation.";
                if (e && e.message) {
                    errorMessage +=  "\nAdditional exception on component load: " + e.message;
                }
                $A.reportError(errorMessage, callbackError);
            }
        }
        that.loading--;
        if (pending.callbacks.length === 0) {
            // there was no callbacks, the error should still be surfaced
            $A.reportError("Error loading component definitions", e);
        }
    })["then"](this.loadingComplete, this.loadingComplete);
};

// Exists only so that instrumentation can hook into script tag load completes
// Called when all the script tags have finished loading. Hook defined in Aura_exports override map
// ComponentDefLoader.loadingComplete
ComponentDefLoader.prototype.loadingComplete = function() {
    // no-op empty function
};

ComponentDefLoader.prototype.checkForError = function (uri, resolve, reject) {
    var uidRegexp = new RegExp(ComponentDefLoader.UID_param + "=([^&]*)");
    var uid = uri.match(uidRegexp);
    if (uid && uid.length > 1) {
        uid = uid[1];
        // TODO: these aren't being loaded by the browser due to the current error status by the server
        if (Aura["componentDefLoaderError"][uid] && Aura["componentDefLoaderError"][uid].length > 0) {
            reject(Aura["componentDefLoaderError"][uid].pop());
            return;
        }
    }
    resolve();
};

ComponentDefLoader.prototype.onerror = function(uri, reject){
    this.checkForError(uri, function(){
        reject("An unknown error occurred attempting to fetch definitions at: " + uri);
    }, reject);
};

ComponentDefLoader.prototype.createScriptElement = function(uri, onload, onerror) {
    var script = document.createElement("script");
    script["type"] = "text/javascript";
    script["src"] = uri;
    script["onload"] = function() {
        onload();
        script["onload"] = script["onerror"] = undefined;
        document.body.removeChild(script);
    };
    script["onerror"] = function(){
        onerror();
        script["onload"] = script["onerror"] = undefined;
        document.body.removeChild(script);
    };
    script["nonce"] = $A.getContext().scriptNonce;
    document.body.appendChild(script);
};

ComponentDefLoader.prototype.setScriptGenerator = function (method) {
    this.prototype.createScriptElement = method;
};

ComponentDefLoader.prototype.generateScriptTag = function(uri) {
    if (!uri) {
        return Promise["resolve"]();
    }

    var that = this;
    return new Promise(function(resolve, reject) {
        that.createScriptElement(uri,
            function () {
                that.checkForError(uri, resolve, reject);
            },
            function () {
                that.onerror(uri, reject);
            }
        );
    });
};

ComponentDefLoader.prototype.schedulePending = function() {
    var that = this;
    this.pending = { callbacks: [], descriptorMap: {} };
    window.setTimeout(function() {
        that.retrievePending.call(that, that.pending);
        that.pending = null;
    }, 0);
    if (!Aura["componentDefLoaderError"]) {
        Aura["componentDefLoaderError"] = {};
    }
};

ComponentDefLoader.prototype.loadComponentDef = function(descriptor, uid, callback) {
    if (this.pending === null) {
        this.schedulePending();
    }

    this.pending.callbacks.push(callback);
    this.pending.descriptorMap[descriptor] = uid;
};

ComponentDefLoader.prototype.loadComponentDefs = function(descriptorMap, callback) {
    if (this.pending === null) {
        this.schedulePending();
    }
    if (callback && typeof callback === "function") {
        //DQ: Should we error here or just bypass this if callback is null?
        this.pending.callbacks.push(callback);
        //Can descriptor map be null? Im pretty sure the answer is 'no'
        Object.assign(this.pending.descriptorMap, descriptorMap);
    }
};

Aura.Component.ComponentDefLoader = ComponentDefLoader;
