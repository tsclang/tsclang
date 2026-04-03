#include "runtime.h"
#include "std/reactive.h"

typedef struct { int32_t _value; void (**_effects)(void); size_t _effect_count; } Signal_i32;
typedef struct { Signal_i32 *x; } _closure_0_env;
static _closure_0_env _closure_0_captured;

static int32_t _closure_0_fn(void) {
    return tsc_signal_get_i32(_closure_0_captured.x) * 2;
}

int main(void) {
    TSC_INIT();
    Signal_i32 x = tsc_signal_create_i32(5);
    _closure_0_captured = (_closure_0_env){ .x = &x };
    Signal_i32 doubled = tsc_computed_i32(_closure_0_fn);
    printf("%d\n", tsc_signal_get_i32(&doubled));
    tsc_signal_set_i32(&x, 10);
    printf("%d\n", tsc_signal_get_i32(&doubled));
    return 0;
}
