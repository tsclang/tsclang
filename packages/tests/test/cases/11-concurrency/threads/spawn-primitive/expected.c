#include "runtime.h"

typedef struct { int32_t x; } _spawn_0_env;

static void *_spawn_0_fn(void *_arg) {
    _spawn_0_env *env = (_spawn_0_env *)_arg;
    printf("%d\n", env->x);
    free(env);
    return NULL;
}

int main(void) {
    TSC_INIT();
    const int32_t x = 42;
    _spawn_0_env *_env_0 = malloc(sizeof(_spawn_0_env));
    _env_0->x = x;
    tsc_thread_t _t_0 = tsc_thread_spawn(_spawn_0_fn, _env_0);
    (void)_t_0;
    return 0;
}
