# Renderer-internal names as directives

`document` is a registered component (the page shell), but invoking it as a
directive must be an error — as it already is in the composer.

:::document
Body.
:::
