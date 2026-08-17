# Deliberately Invalid

The infobox below omits its required `title` param, so lint and render must both
reject this document with a non-empty `findings` array and a non-zero exit code.

:::infobox
No title supplied.
:::
