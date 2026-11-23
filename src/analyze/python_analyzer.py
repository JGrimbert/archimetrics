"""L'analyse des fichiers Python d'archimetrics, sans dépendance : module `ast` et `tokenize` de la bibliothèque standard.

Lit sur l'entrée standard un JSON {"root": ..., "files": [chemins relatifs]} et écrit dans le fichier donné en argument un JSON
{chemin: résultat} : lignes de code, imports, fonctions (lignes, paramètres, cyclomatique, cognitive, imbrication), classes
(méthodes, champs, LCOM4), jetons normalisés pour la recherche de clones. Un fichier illisible rend {"error": "..."}.
"""

import ast
import io
import json
import keyword
import sys
import tokenize

SKIP_TOKENS = {tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING, tokenize.ENDMARKER}
FUNCS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
LOOPS = (ast.For, ast.AsyncFor, ast.While)


def code_lines_and_tokens(text, import_lines):
    lines = set()
    tokens = []
    token_lines = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type in SKIP_TOKENS:
                continue
            for line in range(tok.start[0], tok.end[0] + 1):
                lines.add(line)
            if tok.start[0] in import_lines:
                continue
            if tok.type == tokenize.NAME and not keyword.iskeyword(tok.string):
                tokens.append("i")
            elif tok.type in (tokenize.STRING, tokenize.NUMBER):
                tokens.append("l")
            else:
                tokens.append(tok.string)
            token_lines.append(tok.start[0])
    except (tokenize.TokenError, IndentationError, SyntaxError):
        pass
    return lines, tokens, token_lines


class Measure(ast.NodeVisitor):
    """Cyclomatique et cognitive d'une fonction ; une fonction imbriquée est mesurée à part."""

    def __init__(self, root):
        self.root = root
        self.cyclomatic = 1
        self.cognitive = 0
        self.nesting = 0

    def deeper(self, nodes, depth):
        self.nesting = max(self.nesting, depth)
        for n in nodes:
            self.walk(n, depth)

    def walk(self, node, depth):
        if node is not self.root and isinstance(node, FUNCS):
            return
        if isinstance(node, ast.If):
            self.cyclomatic += 1
            self.cognitive += 1 + depth
            self.walk(node.test, depth)
            self.deeper(node.body, depth + 1)
            orelse = node.orelse
            while len(orelse) == 1 and isinstance(orelse[0], ast.If):
                elif_ = orelse[0]
                self.cyclomatic += 1
                self.cognitive += 1
                self.walk(elif_.test, depth)
                self.deeper(elif_.body, depth + 1)
                orelse = elif_.orelse
            if orelse:
                self.cognitive += 1
                self.deeper(orelse, depth + 1)
            return
        if isinstance(node, LOOPS + (ast.IfExp, ast.ExceptHandler)):
            self.cyclomatic += 1
            self.cognitive += 1 + depth
            self.nesting = max(self.nesting, depth + 1)
            for c in ast.iter_child_nodes(node):
                self.walk(c, depth + 1)
            return
        if isinstance(node, (ast.With, ast.AsyncWith, ast.Try)) or type(node).__name__ in ("TryStar", "Match"):
            if type(node).__name__ == "Match":
                self.cognitive += 1 + depth
            self.nesting = max(self.nesting, depth + 1)
            for c in ast.iter_child_nodes(node):
                self.walk(c, depth + 1)
            return
        if type(node).__name__ == "match_case":
            self.cyclomatic += 1
        if isinstance(node, ast.comprehension):
            self.cyclomatic += 1 + len(node.ifs)
        if isinstance(node, ast.BoolOp):
            self.cyclomatic += len(node.values) - 1
            self.cognitive += 1
        for c in ast.iter_child_nodes(node):
            self.walk(c, depth)


def lcom4(cls):
    methods = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    names = {m.name for m in methods}
    fields = set()
    for m in methods:
        for n in ast.walk(m):
            if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "self" and n.attr not in names:
                fields.add(n.attr)
    for n in cls.body:
        if isinstance(n, (ast.Assign, ast.AnnAssign)):
            for t in (n.targets if isinstance(n, ast.Assign) else [n.target]):
                if isinstance(t, ast.Name):
                    fields.add(t.id)
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    for m in methods:
        parent["m:" + m.name] = "m:" + m.name
    for m in methods:
        for n in ast.walk(m):
            if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "self":
                if n.attr in names:
                    union("m:" + m.name, "m:" + n.attr)
                elif n.attr in fields:
                    parent.setdefault("f:" + n.attr, "f:" + n.attr)
                    union("m:" + m.name, "f:" + n.attr)
    comps = {find("m:" + m.name) for m in methods}
    return {
        "name": cls.name,
        "line": cls.lineno,
        "decorators": [ast.unparse(d).split("(")[0] for d in cls.decorator_list] if hasattr(ast, "unparse") else [],
        "extends": ast.unparse(cls.bases[0]) if cls.bases and hasattr(ast, "unparse") else None,
        "methods": [{"name": m.name, "private": m.name.startswith("_") and not m.name.startswith("__"), "static": False, "decorators": []} for m in methods],
        "fields": sorted(fields),
        "injections": [],
        "lcom4": len(comps) if methods else 0,
        "nestModule": None,
    }


def analyze(text):
    tree = ast.parse(text)
    imports = []
    import_lines = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            for a in n.names:
                imports.append({"spec": a.name, "names": ["*"], "level": 0, "line": n.lineno})
            import_lines.update(range(n.lineno, (n.end_lineno or n.lineno) + 1))
        elif isinstance(n, ast.ImportFrom):
            imports.append({"spec": n.module or "", "names": [a.name for a in n.names], "level": n.level, "line": n.lineno})
            import_lines.update(range(n.lineno, (n.end_lineno or n.lineno) + 1))
    code, tokens, token_lines = code_lines_and_tokens(text, import_lines)

    functions = []
    classes = []

    def visit(node, prefix):
        for c in ast.iter_child_nodes(node):
            if isinstance(c, ast.ClassDef):
                classes.append(lcom4(c))
                visit(c, prefix + c.name + ".")
            elif isinstance(c, (ast.FunctionDef, ast.AsyncFunctionDef)):
                m = Measure(c)
                for s in c.body:
                    m.walk(s, 0)
                end = c.end_lineno or c.lineno
                start = min([c.lineno] + [d.lineno for d in c.decorator_list])
                args = c.args
                params = len(args.posonlyargs) + len(args.args) + len(args.kwonlyargs) + (1 if args.vararg else 0) + (1 if args.kwarg else 0)
                if prefix and args.args and args.args[0].arg in ("self", "cls"):
                    params -= 1
                functions.append({
                    "name": prefix + c.name,
                    "line": start,
                    "endLine": end,
                    "codeLines": sum(1 for l in range(start, end + 1) if l in code),
                    "params": params,
                    "cyclomatic": m.cyclomatic,
                    "cognitive": m.cognitive,
                    "nesting": m.nesting,
                })
                visit(c, prefix + c.name + ".")
            else:
                visit(c, prefix)

    visit(tree, "")
    exports = [n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and not n.name.startswith("_")]
    return {
        "lines": len(text.splitlines()),
        "codeLines": len(code),
        "code": sorted(code),
        "imports": imports,
        "exports": exports,
        "functions": functions,
        "classes": classes,
        "tokens": tokens,
        "tokenLines": token_lines,
    }


def main():
    req = json.load(sys.stdin)
    out = {}
    for rel in req["files"]:
        try:
            with open(req["root"] + "/" + rel, encoding="utf-8") as f:
                out[rel] = analyze(f.read())
        except Exception as e:  # un fichier illisible n'arrête pas les autres
            out[rel] = {"error": f"{type(e).__name__}: {e}"}
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
