#include "runtime.h"
#include "std/reactive.h"

typedef struct { int32_t _value; void (**_effects)(void); size_t _effect_count; int32_t (*_compute)(void); } Signal_i32;

static int32_t calls = 0;

typedef struct { Signal_i32 *a; Signal_i32 *b; } _closure_0_env;
static _closure_0_env _closure_0_captured;
static void _closure_0_fn(void) {
    tsc_signal_get_i32(_closure_0_captured.a);
    tsc_signal_get_i32(_closure_0_captured.b);
    calls += 1;
}

static void _batch_0_fn(void) {
    tsc_signal_set_i32(_closure_0_captured.a, 10);
    tsc_signal_set_i32(_closure_0_captured.b, 20);
}

int main(void) {
    TSC_INIT();
    Signal_i32 a = tsc_signal_create_i32(1);
    Signal_i32 b = tsc_signal_create_i32(2);
    _closure_0_captured = (_closure_0_env){ .a = &a, .b = &b };
    tsc_effect(_closure_0_fn);
    tsc_batch(_batch_0_fn);
    printf("%d\n", calls);
    return 0;
}
