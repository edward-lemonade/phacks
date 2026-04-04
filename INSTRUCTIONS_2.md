1. Simplify the data model. For example, Node.fallacies is redundant since a fallacy is just a type of counterargument. Node types should only be:
[thesis | subclaim | evidence | axiom | counterclaim]

2. Strength score should not be a number. It should be one of these types:
[true | strong | weak | fallacious | false]
True: it is logically true, typically true of axioms.
Strong: not logically true but well supported by its claims, has at most 1 counterclaim.
Weak: has more than 1 found counterclaim.
Fallacious: not necessarily false but the supported reasoning is false.
False: logically and verifiably false statement.