#include "runtime.h"

typedef struct { int32_t n; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->n + 1;
}

tsc_closure makeAdder_i32(int32_t n) {
    _closure_0_env _lambda_env_0 = {.n = n};
    return (tsc_closure){.env = &_lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure add5 = makeAdder_i32(5);
    tsc_closure add10 = makeAdder_i32(10);
    printf("%d\n", ((int32_t (*)(void))add5.fn)());
    printf("%d\n", ((int32_t (*)(void))add10.fn)());
    return 0;
}
