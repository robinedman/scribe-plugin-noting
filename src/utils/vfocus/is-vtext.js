var isVText = require('vtree/is-vtext');

var VFocus = require('../../vfocus');
var isVFocus = require('../vfocus/is-vfocus');


module.exports = function isVTextVFocus(vfocus) {

  if (!isVFocus(vfocus)) {
    throw new Error('Only a VFocus element should be passed to isVText');
  }

  return isVText(vfocus.vNode);

};
