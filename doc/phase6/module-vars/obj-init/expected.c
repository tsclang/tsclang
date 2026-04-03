#include "runtime.h"

typedef struct { bool debug; int32_t maxRetries; } Config;

static const Config config = { .debug = true, .maxRetries = 3 };

int main(void) {
    TSC_INIT();
    printf("%s\n", (config.debug) ? "true" : "false");
    printf("%d\n", config.maxRetries);
    return 0;
}
