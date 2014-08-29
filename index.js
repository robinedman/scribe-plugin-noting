/*
 * Plugin for adding a <note> elements around
 * things.
 */

module.exports = function(user) {
  return function(scribe) {
    /* global window, require */
    var diff = require('virtual-dom/diff');
    var patch = require('virtual-dom/patch');
    var virtualize = require('vdom-virtualize');
    var h = require('virtual-hyperscript');
    var createElement = require('virtual-dom/create-element');
    var isVNode = require('vtree/is-vnode');
    var isVText = require('vtree/is-vtext');

    var _ = require('lodash');

    //currently
    var tag = "gu:note";
    var nodeName = "GU:NOTE";
    var className = "note";
    var dataName = "data-edited-by";
    var dataDate = "data-edited-date";
    var blocks = ["P", "LI", "UL"];
    var noteCommand = new scribe.api.Command('insertHTML');

    function walk(vnode, fn) {
      // this is a semi-recursive tree descent
      // although it's a shame it uses a loop
      // this could be trivially rewritten to be
      // fully recursive
      // this is far simpler than doing rubbish
      // with do whiles
      vnode.children && vnode.children.forEach(function(child) {
        walk(child, fn);
      });

      fn(vnode);
    }

    function flattenVTree(tree) {
      var vNodes = [];
      walk(tree, function(vNode) {
        vNodes.push(vNode);
      });
      return vNodes;
    }

    function isScribeMarker(node) {
       return hasClass(node, "scribe-marker");
    }

    function unlessScribeMarker(node) {
      return ! isScribeMarker(node);
    }

    // Check if VNode has class
    function hasClass(vnode, value) {
      return (vnode.properties &&
        vnode.properties.className &&
        vnode.properties.className === value);
    }

    function isNote(node) {
      return node.tagName === nodeName;
    }

    function dropBeforeMarker (vNodes) {
      return _.rest(vNodes, function (vNode) { return unlessScribeMarker(vNode); });
    }

    function takeBeforeMarker (vNodes) {
       return _.first(vNodes, function (vNode) { return unlessScribeMarker(vNode); });
    }

    function onlyTextNodes (vNodes) {
      function isVTextNode (vNode) { return vNode.type === 'VirtualText'; }

      return vNodes.filter(isVTextNode);
    }

    function findVTextNodesToWrap(vNodes) {
      function selectBetweenMarkers() {
        var results;
        results = dropBeforeMarker(vNodes);
        results = _.rest(results); // remove first marker
        results = takeBeforeMarker(results); // take until end marker
        return results;
      }

      return onlyTextNodes(selectBetweenMarkers());
    }

    function generateUUID(){
      var d = new Date().getTime();
      var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = (d + Math.random()*16)%16 | 0;
          d = Math.floor(d/16);
          return (c=='x' ? r : (r&0x7|0x8)).toString(16);
      });
      return uuid;
    };

    // Wrap in a note.
    // nodeOrText can be a vNode , DOM node or a string.
    function wrapInNote(nodeOrText, noteIdValue) {
      var note = h('gu:note.note', {dataset: {noteId: noteIdValue}}, [nodeOrText]);
      return note;
    }

    // Find wrapped version of vNode
    function locateWrapped(vNode, vTextNodesToWrap, wrappedTextNodes) {
      var index = vTextNodesToWrap.indexOf(vNode);
      return wrappedTextNodes[index];
    }

    // Assumes there's only one marker.
    // Replaces marker with newVNode, and then inserts the marker
    // inside newVNode.
    function insertAtMarker(vTree, newVNode) {
      walk(vTree, function (vNode) {
        if (! vNode.children) { return; }

        for (var i = vNode.children.length - 1; i >= 0; i--) {
          if (isScribeMarker(vNode.children[i])) {
            var marker = vNode.children[i];
            vNode.children[i] = newVNode;
            newVNode.children.push(marker);
          }
        }
      });
    }

    // Walk the tree to find the references to the nodes we wrapped,
    // and replace the references to point to our wrapped versions.
    // Note: If we could rewrite the code to use a zipper we might be able
    // to avoid this step.
    function replaceWithWrappedVersions(tree, vTextNodesToWrap, wrappedTextNodes) {
      walk(tree, function (vNode) {
        if (! vNode.children) { return; }

        for (var i = vNode.children.length - 1; i >= 0; i--) {
            if (_.contains(vTextNodesToWrap, vNode.children[i])) {
              vNode.children[i] = locateWrapped(vNode.children[i], vTextNodesToWrap, wrappedTextNodes);
            }
        }
      });
    }

    /**
    * Note creation
    */

    // tree - tree containing a marker.
    // Note that we will mutate the tree.
    function createEmptyNoteAtCaret(tree) {
      // We need a zero width space character to make the note selectable.
      var zeroWidthSpace = '\u200B';

      insertAtMarker(tree, wrapInNote(zeroWidthSpace, generateUUID()));
    }

    // tree -- tree containing two scribe markers
    // Note that we will mutate the tree.
    function createNoteFromSelection(tree) {
      // Let's operate on arather than trees when we can.
      var vNodes = flattenVTree(tree);

      var noteId = generateUUID();

      // Wrap wrap
      var vTextNodesToWrap = findVTextNodesToWrap(vNodes);
      var wrappedTextNodes = vTextNodesToWrap.map(function (vTextNode) {
        return wrapInNote(vTextNode, noteId);
      });

      replaceWithWrappedVersions(tree, vTextNodesToWrap, wrappedTextNodes);
    }

    function domWalkUpCheck(node, predicate) {
      if (!node.parentNode) { return false; }

      return predicate(node) ? true : domWalkUpCheck(node.parentNode, predicate);
    }

    // Checks whether our selection is within another note.
    function insideNote() {
      var node = window.getSelection().getRangeAt(0).startContainer;

      return domWalkUpCheck(node, function(node) {
        return node.tagName === 'GU:NOTE';
      });
    }



    noteCommand.execute = function () {
      var selection = new scribe.api.Selection();

      // Place markers and create virtual trees.
      // We'll use the markers to determine where a selection starts and ends.
      selection.placeMarkers();
      var originalTree = virtualize(scribe.el);
      var tree = virtualize(scribe.el); // we'll mutate this one

      if (selection.selection.isCollapsed && insideNote(selection)) {
        // Do nothing.
      } else if (selection.selection.isCollapsed) {
        createEmptyNoteAtCaret(tree);

        // Then diff with the original tree and patch the DOM. And we're done.
        var patches = diff(originalTree, tree);
        patch(scribe.el, patches);

        // Place caret (necessary to do this explicitly for FF).
        selection.selectMarkers();
      } else {
        createNoteFromSelection(tree);

        // Then diff with the original tree and patch the DOM. And we're done.
        var patches = diff(originalTree, tree);
        patch(scribe.el, patches);

        // TODO: Remove markers and place caret at appropriate place
      }
    };


      // noteCommand.queryState = function () {
      //   console.log('noteCommand.queryState')
      //   // TODO: The instance in which there are more scribe nodes
      //   // clone the range and see if there are spans in it
      //   var selection = new scribe.api.Selection();
      //   var scribeEls = selection.range.cloneContents().querySelectorAll('.note');
      //   var containsNote = function (scribeEls) {
      //     for (var i = 0, len = scribeEls.length; i < len; i++) {
      //       if (isNote(scribeEls[i])) {
      //         return true;
      //       }
      //     }
      //   };

      //   // check if there is a note in the selection
      //   var isNode = !!selection.getContaining(function (node) {
      //     return isNote(node);
      //   });

      //   return isNode || containsNote(scribeEls);

      // };

      scribe.commands.note = noteCommand;

      scribe.el.addEventListener('keydown', function (event) {
        //that's F10 and F8 and alt+del
        if (event.keyCode === 121 ||event.keyCode === 119) {
          event.preventDefault();
          var noteCommand = scribe.getCommand("note");
          noteCommand.execute();
        }
      });
  }
}
