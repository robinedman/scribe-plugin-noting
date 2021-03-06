var _ = require('lodash');
var isVFocus = require('../vfocus/is-vfocus');

var findParentNoteSegment = require('./find-parent-note-segment');
var isNotScribeMarker = require('./is-not-scribe-marker');
var isVText = require('../vfocus/is-vtext');
var findScribeMarkers = require('./find-scribe-markers');

module.exports = function isSelectionBetweenNotes(markers) {

  //if we pass a raw VFocus
  if (isVFocus(markers)) {
    markers = findScribeMarkers(markers);
  }

  //if we get passed the wrong argument
  if (!_.isArray(markers)) {
    throw new Error('Only an array of markers or a valid VFocus element can be passed to isSelectionBetweenNotes');
  }

  if (markers.length <= 0) return;

  // if we have two valid markers
  if (markers.length === 2) {
    var selection = markers[0]
      .next()
      .takeWhile(isNotScribeMarker)

      // We need the focusOnTextNode filter so we don't include P tags that
      // contains notes for example.
      .filter(isVText);

    return selection.every(findParentNoteSegment);
  }
  //if we only have on valid marker
  //we see if it has a parent note
  else {
    return !!findParentNoteSegment(markers[0]);
  }


};
