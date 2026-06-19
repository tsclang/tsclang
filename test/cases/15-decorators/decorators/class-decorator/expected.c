#include "runtime.h"

typedef struct { bool debug; bool _sealed; } Config;

int main(void) {
    TSC_INIT();
    Config c = {0};
    c._sealed = true;
    c.debug = false;
    printf("%s\n", (c.debug) ? "true" : "false");
    return 0;
}
