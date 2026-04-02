#include "runtime.h"
#include "std/reactive.h"

typedef struct { int32_t _value; void (**_effects)(void); size_t _effect_count; } Signal_i32;
typedef struct { Signal_i32 *x; } _closure_0_env;
static _closure_0_env _closure_0_captured;

static void _closure_0_fn(void) {
    printf("%d\n", tsc_signal_get_i32(_closure_0_captured.x));
}

int main(void) {
    TSC_INIT();
    Signal_i32 x = tsc_signal_create_i32(1);
    _closure_0_captured = (_closure_0_env){ .x = &x };
    tsc_effect(_closure_0_fn);
    tsc_signal_set_i32(&x, 2);
    return 0;
}
