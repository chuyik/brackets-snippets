/*jslint indent: 2, maxerr: 50 */
/*global define, $, brackets */

/**
 * Java​Script Snippets for Brackets
 *
 * Based on:
 *   Java​Script & Node​JS Snippets for Sublime
 */
define(function (require, exports, module) {
  "use strict";

  var AppInit        = brackets.getModule('utils/AppInit'),
      EditorManager  = brackets.getModule("editor/EditorManager");

  var Hinter = require('./lib/Hinter'),
      HintWidget = require('./widget/main');

  var hinter, hintWidget;

  var handlers;
  function activeEditorChangeHandler (bracketsEvent, focusedEditor, lostEditor) {

    if (lostEditor) {
      lostEditor.off = lostEditor.off || $(lostEditor).off;

      if(hinter){
        lostEditor
          .off("keydown", handlers.keydown)
          .off("keypress", handlers.keypress)
          .off("keyup", handlers.keyup)
          .off("change", handlers.change)
          .off("cursorActivity", handlers.cursorActivity);
      }
    }

    if (focusedEditor) {
      focusedEditor.on = focusedEditor.on || $(focusedEditor).on;

      if (!hinter) {
        hinter = new Hinter(focusedEditor);
        hintWidget = new HintWidget();
        hintWidget.init(hinter);
      } else {
        hinter.init(focusedEditor);
      }

      handlers = {
        keydown: hinter.keyDownHandler.bind(hinter),
        keypress: hinter.keyPressHandler.bind(hinter),
        keyup: hinter.keyUpHandler.bind(hinter),
        change: hinter.changeHandler.bind(hinter),
        cursorActivity: hinter.cursorActivityHandler.bind(hinter)
      };

      focusedEditor
        .on("keydown", handlers.keydown)
        .on("keypress", handlers.keypress)
        .on("keyup", handlers.keyup)
        .on("change", handlers.change)
        .on("cursorActivity", handlers.cursorActivity);
    }
  }


  AppInit.appReady(function () {
    // Instantly initialize extension after being installed.
    //  Note:
    //    The editor instance would be null at the moment when Brackets starts
    var editor = EditorManager.getCurrentFullEditor();
    if(editor){
      activeEditorChangeHandler(null, editor, null);
    }

    EditorManager.on = EditorManager.on || $(EditorManager).on;
    EditorManager.on('activeEditorChange', activeEditorChangeHandler);
  });

});