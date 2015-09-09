/*jslint indent: 2, maxerr: 50 */
/*global define, $, brackets, window, Mustache */

/**
 * Snippets Widget
 */
define(function (require, exports, module) {
  "use strict";

  var ExtensionUtils   = brackets.getModule('utils/ExtensionUtils'),
      WorkspaceManager = brackets.getModule('view/WorkspaceManager'),
      MainViewManager  = brackets.getModule('view/MainViewManager'),
      Resizer          = brackets.getModule('utils/Resizer'),
      _                = brackets.getModule("thirdparty/lodash"),
      LanguageManager  = brackets.getModule("language/LanguageManager"),
      PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
      FileSystem       = brackets.getModule("filesystem/FileSystem"),
      FileUtils        = brackets.getModule("file/FileUtils"),
      CommandManager   = brackets.getModule("command/CommandManager"),
      Commands         = brackets.getModule("command/Commands"),
      Menus            = brackets.getModule("command/Menus"),
      HintManager      = require("../lib/HintManager");

  // Load HTML
  var ButtonHTML = require('text!./html/button.html'),
      PanelHTML = require('text!./html/panel.html');

  // Load CSS
  ExtensionUtils.loadStyleSheet(module, 'thirdparty/bootstrap-responsive.min.css');
  ExtensionUtils.loadStyleSheet(module, 'thirdparty/highlight/github.css');
  ExtensionUtils.loadStyleSheet(module, 'css/main.less');

  window.name = "NG_DEFER_BOOTSTRAP!";

  var CONST = {
    PANEL_ID: 'edc-brackets-snippets-panel',
    BUTTON_ID: 'edc-brackets-snippets-btn'
  }

  var $appButton, $appPanel, togglePanelCmd;

  /**
   * Constructor to create a hints manager.
   *
   * @constructor
   */
  function HintWidget () {

  }

  HintWidget.prototype.init = function (hinter) {
    if (!hinter) { throw 'Hinter instance is required'; }
    this.setHinter(hinter);

    var onTogglePanel = togglePanelHandler.bind(this),
        viewMenu;

    // Insert Button
    $('#main-toolbar .buttons').append(ButtonHTML);
    $appButton = $('#' + CONST.BUTTON_ID).on('click', onTogglePanel);

    // add menu item entry
    togglePanelCmd = CommandManager.register("Snippets Manager", "toggleSnippetsManager", onTogglePanel);
    viewMenu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    viewMenu.addMenuItem(togglePanelCmd);

    this.initPanel();
  };

  HintWidget.prototype.initPanel = function() {
    var self = this;

    // Create Brackets Panel
    WorkspaceManager.createBottomPanel(CONST.PANEL_ID, $(PanelHTML), 100);
    $appPanel = $('#' + CONST.PANEL_ID);

    // Initialize AngularJS app
    requirejs.config({
      baseUrl: require.toUrl('.'),
      paths: {
        highlight:  './thirdparty/highlight/highlight.pack',
        _: './thirdparty/lodash',
        ace: './thirdparty/ace-builds/src-min-noconflict/ace',
        uiAce: './thirdparty/angular-ui-ace/ui-ace.min',
        jsyaml: '../thirdparty/js-yaml.min',
        angular: './thirdparty/angular.min',
        keystroke: '../thirdparty/keystroke-converter',
        app: './js/app',
        snippetsCtrl: './js/snippets.controller',
        settingsCtrl: './js/settings.controller',
        libraryCtrl:  './js/library.controller',
        foldingDirective:  './js/folding.directive',
        highlightDirective:  './js/highlight.directive',
        popConfirmDirective:  './js/pop-confirm.directive',
        filterBarsDirective:  './js/filter-bars.directive',
        storageService:  './js/storage.service',
        miscDirective:  './js/misc.directive'
      },
      shim: {
        'angular': {
          exports: 'angular'
        },
        'uiAce': {
          'angular': 'angular'
        }
      }
    })

    // Panel close button
    $('#' + CONST.PANEL_ID + ' .close').on('click', togglePanelHandler.bind(this));

    // Prepare Data
    define('languages', function() {
      var languages = _.map(LanguageManager.getLanguages(), function (language) {
        return {
          id: language.getId(),
          name: language.getName()
        }
      })
      languages.unshift({
        id: '_any',
        name: '--- Any ---'
      })
      return languages
    })
    define('userHints', function() {
      return self.hinter.allHints
    })
    define('libraryHints', function() {
      return HintManager.loadLibraryHints()
    })
    define('settingsData', function() {
      var basePref = PreferencesManager.getExtensionPrefs(".").base;
      var appPref = PreferencesManager.getExtensionPrefs("edc.brackets-snippets");
      return {
        '_insertHintOnTab': basePref.get('insertHintOnTab'),
        'keyNext': appPref.get('keyNext')
      }
    })

    // Bootstrap angular
    requirejs(['angular', 'app', 'snippetsCtrl', 'settingsCtrl', 'libraryCtrl',
                'foldingDirective', 'highlightDirective', 'popConfirmDirective',
                'filterBarsDirective', 'storageService', 'miscDirective'],
      function(angular) {
        $appPanel.ready(function() {
          angular.bootstrap($appPanel, ['snippets-manager']);

          // remove hashtag from URL
          // (the hashtag generated by Angular could lead to #19)
          if (history){
            setTimeout(function (){
                history.pushState("", document.title, window.location.pathname
                                                         + window.location.search);
              }, 512)
          }
        });
    })
  }

  HintWidget.prototype.setHinter = function (hinter) {
    this.hinter = hinter;
  };

  function togglePanelHandler () {
    Resizer.toggle($appPanel);
    $appButton.toggleClass('active');

    var isActive = $appButton.hasClass('active');

    if (isActive) {
      // opened
      $(document).on('update-snippets', hintsUpdateHandler.bind(this));
      $(document).on('restore-snippets', hintsRestoreHandler.bind(this));
      $(document).on('export-snippets', hintsExportHandler.bind(this));
      $(document).on('prefs-changed', prefUpdateHandler.bind(this));
    } else {
      // closed
      MainViewManager.focusActivePane();
      $(document).off('restore-snippets');
      $(document).off('update-snippets');
      $(document).off('export-snippets');
      $(document).off('prefs-changed');
    }

    togglePanelCmd.setChecked(isActive);
  }

  function hintsUpdateHandler (ev, snippets) {
    this.hinter.updateHints(snippets);
  }

  function hintsRestoreHandler (ev, callback) {
    this.hinter.restoreHints();
    if (callback) {callback(this.hinter.allHints);}
  }

  function hintsExportHandler (ev, exportText, successCallback, failCallback) {
    // beautify text first
    exportText = exportText
    .replace(                       // remove ""
      /(\s\stext:\s)"(.*)"/g,
      function (str, textKey, textValue) {
        return textKey +
                '|\n        ' +
                textValue
                  .replace(/\\"/g, '"')
                  .replace(/\\n/g, '\n        ') + // add indentation to multi-line text
                '\n';
      });

    // show file dialog and write out
    FileSystem.showSaveDialog('Export location', null, 'export-snippets.yml', function(x, path) {
      if (path) {
        var file = FileSystem.getFileForPath(path);
        FileUtils.writeText(file, exportText, true)
        .done(function() {
          if (successCallback) {successCallback(openFile, file)}
        })
        .fail(function() {
          if (failCallback) {failCallback()}
        });
      }
    })
  }

  function openFile (file) {
    CommandManager.execute(Commands.CMD_OPEN, file)
  }

  /**
   * prefs key prefix:
   *   default: _               eg: `_insertHintOnTab`
   *   brackets-snippets: none  eg: `hints`
   */
  function prefUpdateHandler (ev, prefs) {

    _.forIn(prefs, function(v, k) {

      var pref;
      // default prefs
      if (k.indexOf('_') === 0) {
        pref = PreferencesManager.getExtensionPrefs(".").base;
        k = k.slice(1);
      }
      // brackets-snippets prefs
      else {
        pref = PreferencesManager.getExtensionPrefs("edc.brackets-snippets");
      }

      pref.set(k, v);
    });
  }

  module.exports = HintWidget;
});