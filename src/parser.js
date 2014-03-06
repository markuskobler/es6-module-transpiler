var estraverse = require('estraverse');
var esprima = require('esprima');

const LITERAL = 'Literal';

class Parser {
  constructor(script) {
    this.parse(script);
  }

  parse(script) {
    this.imports = [];
    this.exports = [];
    this.directives = [];
    this.exportDefault = undefined;

    this.importedIdentifiers = {};
    this.importsToRewrite = [];

    estraverse.traverse(esprima.parse(script, {range: true, loc: true}), {
      enter: this.enter.bind(this),
      leave: this.leave.bind(this)
    });
  }

  enter(node, parent) {
    if (node.type) {
      var processor = this['process'+node.type];
      if (processor) {
        var result = processor.call(this, node, parent);
        if (result === false) {
          return;
        }
      }
    }

    // directives have to be top-level
    if (node.comments && node.type === "Program") {
      for (var comment of node.comments) {
        if (comment.value.indexOf("transpile:") !== -1) {
          this.directives.push(comment);
        }
      }
    }
  }

  leave(node, parent) {
  }

  processImportDeclaration(node, parent) {
    var {kind, source} = node;

    if (source.type !== LITERAL || typeof source.value !== 'string') {
      throw new Error('invalid module source: '+source.value);
    }

    for (var specifier of node.specifiers) {
      var alias = specifier.name ? specifier.name.name : specifier.id.name;

      if ( kind === 'default' ) {
        this.importedIdentifiers[alias] = { name: 'default', moduleName: source.value};
      } else {
        this.importedIdentifiers[alias] = { name: specifier.id.name, moduleName: source.value};
      }
    }

    switch (kind) {
      case 'named':
        this.processNamedImportDeclaration(node, parent);
        break;

      case "default":
        this.processDefaultImportDeclaration(node, parent);
        break;

      // bare import (i.e. `import "foo";`)
      case undefined:
        this.processNamedImportDeclaration(node, parent);
        break;

      default:
        throw new Error('unknown import kind: '+kind);
    }
  }

  processNamedImportDeclaration(node, parent) {
    this.imports.push(node);
  }

  processDefaultImportDeclaration(node, parent) {
    if (node.specifiers.length !== 1) {
      throw new Error('expected one specifier for default import, got '+node.specifiers.length);
    }

    this.imports.push(node);
  }

  processExportDeclaration(node, parent) {
    if (!node.declaration && !node.specifiers) {
      throw new Error('expected declaration or specifiers after `export` keyword');
    }
    this.exports.push(node);
  }

  processModuleDeclaration(node, parent) {
    this.imports.push(node);
  }

  processIdentifier(node, parent) {
    if (parent && (parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier')) {
      // this should be taken care of by processImportDeclaration
      return;
    }

    if ( node.name in this.importedIdentifiers ) {
      // TODO: Check scope, prevent rewriting shadowed variables
      // if ( node.scope === 0 ) {
      this.importsToRewrite.push(node);
      // }
    }
  }
}

module.exports = Parser;