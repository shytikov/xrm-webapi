import {Promise} from "es6-promise";
import {Guid, Entity, Attribute, FunctionInput} from "./xrm-types";

export class WebApi {
    private static getRequest(method: string, queryString: string) {
        const context = typeof GetGlobalContext != "undefined" ? GetGlobalContext() : Xrm.Page.context;
        let url = context.getClientUrl() + "/api/data/v8.1/" + queryString;
        
        const request = new XMLHttpRequest();
        request.open(method, url, true);
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json; charset=utf-8");
        request.setRequestHeader("OData-MaxVersion", "4.0");
        request.setRequestHeader("OData-Version", "4.0");

        return request;
    }

    private static getFunctionInputs(queryString: string, inputs: Array<FunctionInput>) {        
        let aliases = "?";

        for (let i = 0; i < inputs.length; i++) {
            queryString += inputs[i].name;

            if (inputs[i].alias) {
                queryString += `=@${inputs[i].alias},`
                aliases += `@${inputs[i].alias}=${inputs[i].value}`
            } else {
                queryString += `=${inputs[i].value},`
            }
        }

        queryString += queryString.substr(0, queryString.length - 1) + ")";

        if (aliases != "?") {
            queryString += aliases
        }

        return queryString;
    }

    private static getPreferHeader(formattedValues, lookupLogicalNames, associatedNavigationProperties, maxPageSize?: number) {
        let prefer = [];

        if (maxPageSize) {
            prefer.push(`odata.maxpagesize=${maxPageSize}`);
        }
        
        if (formattedValues && lookupLogicalNames & associatedNavigationProperties) {
            prefer.push('odata.include-annotations="*"');
        } else {
            const preferExtra = [            
                formattedValues ? "OData.Community.Display.V1.FormattedValue" : "",
                lookupLogicalNames ? "Microsoft.Dynamics.CRM.lookuplogicalname" : "",
                associatedNavigationProperties ? "Microsoft.Dynamics.CRM.associatednavigationproperty" : ""
            ].filter((v, i) => { return v != ""}).join(",");

            prefer.push('odata.include-annotations="' + preferExtra + '"');
        }
              
        return prefer.join(",");
    }

    /**
     * Retrieve a record from CRM
     * @param entityType Type of entity to retrieve
     * @param id Id of record to retrieve
     * @param queryString OData query string parameters
     * @param includeFormattedValues Include formatted values in results
     * @param includeLookupLogicalNames Include lookup logical names in results
     * @param includeAssociatedNavigationProperty Include associated navigation property in results
     */
    static retrieve(entityType: string, id: Guid, queryString?: string, includeFormattedValues = false, includeLookupLogicalNames = false, includeAssociatedNavigationProperties = false) {
        if (queryString != null && ! /^[?]/.test(queryString)) queryString = `?${queryString}`;        

        var req = this.getRequest("GET", `${entityType}(${id.value})${queryString}`);

        if (includeFormattedValues || includeLookupLogicalNames || includeAssociatedNavigationProperties) {
          req.setRequestHeader("Prefer", this.getPreferHeader(includeFormattedValues, includeLookupLogicalNames, includeAssociatedNavigationProperties));
        }

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Retrieve multiple records from CRM
     * @param entitySet Type of entity to retrieve
     * @param queryString OData query string parameters
     * @param includeFormattedValues Include formatted values in results
     * @param includeLookupLogicalNames Include lookup logical names in results
     * @param includeAssociatedNavigationProperty Include associated navigation property in results
     * @param maxPageSize Records per page to return
     */
    static retrieveMultiple(entitySet: string, queryString?: string, includeFormattedValues = false, includeLookupLogicalNames = false, includeAssociatedNavigationProperties = false, maxPageSize?: number) {
        if (queryString != null && ! /^[?]/.test(queryString)) queryString = `?${queryString}`;

        var req = this.getRequest("GET", entitySet + queryString);

        if (includeFormattedValues || includeLookupLogicalNames || includeAssociatedNavigationProperties) {
          req.setRequestHeader("Prefer", this.getPreferHeader(includeFormattedValues, includeLookupLogicalNames, includeAssociatedNavigationProperties, maxPageSize));
        }

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Create a record in CRM
     * @param entitySet Type of entity to create
     * @param entity Entity to create
     */
    static create(entitySet: string, entity: Entity): Promise<string> {
        var req = this.getRequest("POST", entitySet);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve(req.getResponseHeader("OData-EntityId"));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            const attributes = entity.attributes.map(attribute => { return { [attribute.name]: attribute.value }});            

            req.send(JSON.stringify(attributes));
        });
    }

    /**
     * Update a record in CRM
     * @param entitySet Type of entity to update
     * @param id Id of record to update
     * @param entity Entity fields to update
     */
    static update(entitySet: string, id: Guid, entity: Entity) {        
        var req = this.getRequest("PATCH", `${entitySet}(${id.value})`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            const attributes = entity.attributes.map(attribute => { return { [attribute.name]: attribute.value }});

            req.send(JSON.stringify(attributes));
        });
    }

    /**
     * Update a single property of a record in CRM
     * @param entitySet Type of entity to update
     * @param id Id of record to update
     * @param attribute Attribute to update     
     */
    static updateProperty(entitySet: string, id: Guid, attribute: Attribute) {        
        var req = this.getRequest("PUT", `${entitySet}(${id.value})`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            const name = attribute.name;

            req.send(JSON.stringify({ name : attribute.value }));
        });
    }

    /**
     * Delete a record from CRM
     * @param entitySet Type of entity to delete
     * @param id Id of record to delete
     */
    static delete(entitySet: string, id: Guid) {        
        var req = this.getRequest("DELETE", `${entitySet}(${id.value})`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Delete a property from a record in CRM
     * @param entitySet Type of entity to update
     * @param id Id of record to update
     * @param attribute Attribute to delete
     */
    static deleteProperty(entitySet: string, id: Guid, attribute: Attribute) {
        var req = this.getRequest("DELETE", `${entitySet}(${id.value})/${attribute.name}`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Execute a default or custom bound action in CRM
     * @param entitySet Type of entity to run the action against
     * @param id Id of record to run the action against
     * @param actionName Name of the action to run
     * @param inputs Any inputs required by the action
     */
    static boundAction(entitySet: string, id: Guid, actionName: string, inputs?: Object) {        
        var req = this.getRequest("POST", `${entitySet}(${id.value})/Microsoft.Dynamics.CRM.${actionName}`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }
    
    /**
     * Execute a default or custom unbound action in CRM
     * @param actionName Name of the action to run
     * @param inputs Any inputs required by the action
     */
    static unboundAction(actionName: string, inputs?: Object) {
        var req = this.getRequest("POST", `Microsoft.Dynamics.CRM.${actionName}`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }

    /**
     * Execute a default or custom bound action in CRM
     * @param entitySet Type of entity to run the action against
     * @param id Id of record to run the action against
     * @param functionName Name of the action to run
     * @param inputs Any inputs required by the action
     */
    static boundFunction(entitySet: string, id: Guid, functionName: string, inputs?: Array<FunctionInput>) {
        let queryString = `${entitySet}(${id.value})/Microsoft.Dynamics.CRM.${functionName}(`;
        queryString = this.getFunctionInputs(queryString, inputs);

        var req = this.getRequest("GET", queryString);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }

    /**
     * Execute an unbound function in CRM
     * @param functionName Name of the action to run
     * @param inputs Any inputs required by the action
     */
    static unboundFunction(functionName: string, inputs?: Array<FunctionInput>) {
        let queryString = `${functionName}(`;
        queryString = this.getFunctionInputs(queryString, inputs);
        
        var req = this.getRequest("GET", queryString);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }
}