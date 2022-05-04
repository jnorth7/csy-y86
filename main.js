// main interface

var assemblyInput = CodeMirror.fromTextArea($(".input")[0], {lineNumbers: true});

$(".assemble").click(e => {
  let assembler = new Assembler(assemblyInput.getValue());
  let out = "(empty)";
  try {
    out = assembler.assemble().toHex();
    $(".output").removeClass("err");
  }
  catch (err) {
    $(".output").addClass("err");
    out = err.toString();
  }
  $(".output").text(out);
});