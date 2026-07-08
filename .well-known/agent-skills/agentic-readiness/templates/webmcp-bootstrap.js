/**
 * WebMCP Browser-Native Polyfill and Tool Registration Bootstrap
 * 
 * Exposes core application capabilities directly to AI-enabled browsers
 * (such as Chrome with WebMCP enabled) or client-side agent frameworks.
 * 
 * Usage: Include this script in your main HTML <head> or import it early
 * in your client bundle.
 */

(function() {
    'use strict';

    // 1. Safe Polyfill for window.navigator.modelContext
    window.navigator = window.navigator || {};
    if (!window.navigator.modelContext) {
        window.navigator.modelContext = {
            tools: [],
            provideContext: function(options) {
                if (options && options.tools) {
                    this.tools.push.apply(this.tools, options.tools);
                }
                return Promise.resolve();
            }
        };
        console.log("WebMCP: Polyfill injected.");
    }

    // 2. Register Client-Side Tools
    window.navigator.modelContext.provideContext({
        tools: [
            {
                name: "search_data_resources",
                description: "Search and filter key application resources. Performs real-time client-side queries or fetches public endpoints with default sanity filters.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Search term or keyword filter" },
                        category: { type: "string", description: "Narrow results by category or tag" },
                        limit: { type: "number", description: "Maximum number of results to return, default 10" }
                    }
                },
                execute: function(args) {
                    var query = (args.query || "").toLowerCase();
                    var category = (args.category || "").toLowerCase();
                    var limit = args.limit || 10;

                    // Replace with your real fetch or internal search logic
                    return fetch("/api/resources")
                        .then(function(res) { return res.json(); })
                        .then(function(data) {
                            var items = data.items || [];
                            var filtered = items.filter(function(item) {
                                if (query && !item.name.toLowerCase().includes(query)) return false;
                                if (category && item.category.toLowerCase() !== category) return false;
                                return true;
                            });
                            return {
                                success: true,
                                results: filtered.slice(0, limit)
                            };
                        })
                        .catch(function(err) {
                            return { success: false, error: err.message };
                        });
                }
            },
            {
                name: "calculate_projection_model",
                description: "Compute client-side models, savings plans, compound growth, or conversion projections cleanly in the sandbox.",
                inputSchema: {
                    type: "object",
                    required: ["principal", "rate", "periods"],
                    properties: {
                        principal: { type: "number", description: "Starting principal or base monthly amount" },
                        rate: { type: "number", description: "Annual percentage rate, e.g. 5.5" },
                        periods: { type: "number", description: "Total duration or compound periods (e.g., years or months)" }
                    }
                },
                execute: function(args) {
                    try {
                        var p = args.principal;
                        var r = args.rate / 100;
                        var n = args.periods;
                        
                        // Example compound interest model calculation
                        var futureValue = p * Math.pow(1 + r, n);
                        
                        return Promise.resolve({
                            success: true,
                            model: {
                                principal: p,
                                annualRate: args.rate,
                                periods: n,
                                futureValue: Math.round(futureValue),
                                netGrowth: Math.round(futureValue - p)
                            }
                        });
                    } catch (e) {
                        return Promise.resolve({ success: false, error: e.message });
                    }
                }
            }
        ]
    }).then(function() {
        console.log("WebMCP: Tools registered successfully.");
    });
})();
