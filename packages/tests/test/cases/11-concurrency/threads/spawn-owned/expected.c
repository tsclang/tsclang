#include "runtime.h"

typedef struct { int32_t value; } Data;

typedef struct {  } _spawn_0_env;

static Data d = {0};

static void *_spawn_0_fn(void *_arg) {
    _spawn_0_env *env = (_spawn_0_env *)_arg;
    printf("%d\n", d.value);
    free(env);
    return NULL;
}

int main(void) {
    TSC_INIT();
    d.value = 42;
    _spawn_0_env *_env_0 = malloc(sizeof(_spawn_0_env));
    tsc_thread_t _t_0 = tsc_thread_spawn(_spawn_0_fn, _env_0);
    tsc_thread_join(_t_0);
    return 0;
}
