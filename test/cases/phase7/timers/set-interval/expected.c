#include "runtime.h"

typedef struct { int32_t count; } _closure_0_env;
static _closure_0_env _closure_0_captured;

static void _closure_0_fn(void) {
    _closure_0_captured.count += 1;
}

int main(void) {
    TSC_INIT();
    int32_t count = 0;
    _closure_0_captured = (_closure_0_env){ .count = count };
    tsc_set_interval(_closure_0_fn, 50);
    return 0;
}
