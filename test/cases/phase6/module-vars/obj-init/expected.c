#include "runtime.h"

typedef struct { bool debug; int32_t maxRetries; } Config;

int main(void) {
    TSC_INIT();
    const Config config = { .debug = true, .maxRetries = 3 };
    printf("%s\n", (config.debug) ? "true" : "false");
    printf("%d\n", config.maxRetries);
    return 0;
}
