import * as ts from 'typescript';
import * as Lint from 'tslint';

const OPTION_USE_TABS = 'tabs';

export class Rule extends Lint.Rules.AbstractRule {
    public static ControlStatementsOwnLineMessage =
        'Control statements (else/catch/finally) should be on their own line.';
    public static MultilineConstructorMessage = 'Constructors with property declarations should be multi-line.';

    public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
        const walker = new PrettiestWalker(sourceFile, this.getOptions());
        return this.applyWithWalker(walker);
    }
}

class PrettiestWalker extends Lint.RuleWalker {
    private readonly indent: string;
    private readonly size: number;
    private readonly tabs: boolean;

    constructor(sourceFile: ts.SourceFile, options: Lint.IOptions) {
        super(sourceFile, options);
        this.tabs = this.hasOption(OPTION_USE_TABS);
        this.size = (this.getOptions()[2] && this.getOptions()[2]) || 4;
        this.indent = this.tabs ? '\t' : ' '.repeat(this.size);
    }

    protected visitConstructorDeclaration(node: ts.ConstructorDeclaration): void {
        super.visitConstructorDeclaration(node);

        const signature = node
            .getChildren()
            .filter(c => c.kind === ts.SyntaxKind.SyntaxList)
            .shift();
        if (!signature) return;

        let hasProperties = false;
        let requiresFix = false;
        let previousLine = this.getStartPosition(node).line;

        const parameters = signature.getChildren().filter(c => c.kind === ts.SyntaxKind.Parameter);
        for (const p of parameters) {
            const modifiers = p
                .getChildren()
                .filter(c => c.kind === ts.SyntaxKind.SyntaxList)
                .shift();
            if (modifiers) {
                const keyword = modifiers
                    .getChildren()
                    .filter(
                        c =>
                            c.kind === ts.SyntaxKind.PrivateKeyword ||
                            c.kind === ts.SyntaxKind.ProtectedKeyword ||
                            c.kind === ts.SyntaxKind.PublicKeyword
                    )
                    .shift();
                if (keyword) {
                    hasProperties = true;
                }
            }

            const line = this.getStartPosition(p).line;
            if (hasProperties && line === previousLine) {
                requiresFix = true;
                break;
            }

            previousLine = line;
        }

        if (requiresFix) {
            const count = this.getIndentCount(node);
            let text = `\n${this.indent.repeat(count + 1)}${signature.getText()}\n${this.indent.repeat(count)}`;
            text = text.replace(/, (?!\n)/g, `,\n${this.indent.repeat(count + 1)}`);

            const fix = new Lint.Replacement(signature.getStart(), signature.getWidth(), text);
            this.addFailureAtNode(signature, Rule.MultilineConstructorMessage + `\n${text}`, fix);
        }
    }

    // check that the "catch" and "finally" keyword are on the correct line.
    // all other checks regarding try/catch statements will be covered in the "visitBlock" callback
    protected visitTryStatement(tryStatement: ts.TryStatement): void {
        super.visitTryStatement(tryStatement);

        // check catch
        const catchClause = tryStatement.catchClause;
        if (catchClause) {
            this.checkTryStatement(tryStatement, catchClause);
        }

        // check finally
        // const finallyBlock = tryStatement.finallyBlock;
        // Search for the finally keyword, since it isn't included in the tryStatement.finallyBlock
        const finallyBlock = tryStatement
            .getChildren()
            .filter(c => c.kind === ts.SyntaxKind.FinallyKeyword)
            .shift();
        if (finallyBlock) {
            this.checkTryStatement(tryStatement, finallyBlock);
        }
    }

    private checkTryStatement(tryStatement: ts.TryStatement, node: ts.Node): void {
        const previousNode = this.getPreviousNode(tryStatement.getChildren(), node);
        const requiresFix = this.areOnSameLine(previousNode, node);

        if (requiresFix) {
            const count = this.getIndentCount(node, 2); // Offset is 2, because of the } and space
            const fix = new Lint.Replacement(node.getFullStart(), 1, `\n${this.indent.repeat(count)}`);
            this.addFailureAtNode(node, Rule.ControlStatementsOwnLineMessage, fix);
        }
    }

    // check that the "else" keyword is on the correct line.
    // all other checks regarding if statements will be covered in the "visitBlock" callback
    protected visitIfStatement(ifStatement: ts.IfStatement): void {
        super.visitIfStatement(ifStatement);

        const elseKeyword = ifStatement
            .getChildren()
            .filter(ch => ch.kind === ts.SyntaxKind.ElseKeyword)
            .shift();

        if (!elseKeyword) {
            return;
        }

        const previousNode = ifStatement.getChildren()[ifStatement.getChildren().indexOf(elseKeyword) - 1];
        const requiresFix = this.areOnSameLine(previousNode, elseKeyword);

        // if the if statement doesn't have a "block" element, it means it has no braces,
        // and when there are no braces, there are no problems
        if (!ifStatement.getChildren().some(ch => ch.kind === ts.SyntaxKind.Block)) {
            return;
        }

        if (requiresFix) {
            const count = this.getIndentCount(elseKeyword, 2); // Offset is 2, because of the } and space
            const fix = new Lint.Replacement(elseKeyword.getFullStart(), 1, `\n${this.indent.repeat(count)}`);
            this.addFailureAtNode(elseKeyword, Rule.ControlStatementsOwnLineMessage, fix);
        }
    }

    private areOnSameLine(node: ts.Node, nextNode: ts.Node): boolean {
        return this.getEndPosition(node).line === this.getStartPosition(nextNode).line;
    }

    private getIndentCount(node: ts.Node, offset: number = 0) {
        const pos = this.getStartPosition(node).character - offset;
        return this.tabs ? pos : Math.ceil(pos / this.size);
    }

    private getStartPosition(node: ts.Node) {
        return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
    }

    private getEndPosition(node: ts.Node) {
        return node.getSourceFile().getLineAndCharacterOfPosition(node.getEnd());
    }

    // returns previous node which is either block or catch clause (no keywords, etc).
    private getPreviousNode(children: ts.Node[], node: ts.Node): ts.Node {
        let position = children.indexOf(node) - 1;
        while (position >= 0) {
            // is first child always block or catch clause?
            if (
                children[position].kind === ts.SyntaxKind.Block ||
                children[position].kind === ts.SyntaxKind.CatchClause
            ) {
                break;
            }
            position -= 1;
        }
        return children[position];
    }
}
