var _ = require('lodash');
// Check if VNode has class
// TODO: Currently not working on nodes with multiple classes (not an
// issue at the moment).
module.exports = function hasClass(vNode, value) {

  if (!vNode || !vNode.properties || !vNode.properties.className) {
    return false;
  }

  var regEx = new RegExp(value);
  return regEx.test(vNode.properties.className);

};
