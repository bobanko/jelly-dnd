// Campaign order. Map files remain JSON.
(function(root){
 'use strict';
 const catalog={
  "version": 1,
  "standard": [
    "01-first-steps.json",
    "02-helping-hands.json",
    "03-true-colors.json",
    "04-through-the-rift.json",
    "against-the-flow.json",
    "bodyguards.json",
    "crate-expectations.json",
    "collateral-damage.json",
    "05-sunken-sanctum.json"
  ],
  "extra": []
};
 if(typeof module!=='undefined'&&module.exports)module.exports=catalog;
 else root.JellyLevelCatalog=catalog;
})(globalThis);
