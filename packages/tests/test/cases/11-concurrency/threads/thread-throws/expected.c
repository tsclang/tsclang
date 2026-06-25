#include "runtime.h"

typedef struct { TscError _base; } ThreadErr;
typedef struct { bool ok; union { int _dummy; ThreadErr error; }; } Result_void_ThreadErr;
typedef struct { Result_void_ThreadErr result; } _spawn_0_env;

static ThreadErr ThreadErr_new(String msg) {
    ThreadErr self = {0};
    self._base.message = msg;
    return self;
}

static void *_spawn_0_fn(void *_arg) {
    _spawn_0_env *env = (_spawn_0_env *)_arg;
    env->result = (Result_void_ThreadErr){.ok = false, .error = ThreadErr_new(STR_LIT("fail"))};
    return NULL;
}

int main(void) {
    TSC_INIT();
    _spawn_0_env *_env_0 = malloc(sizeof(_spawn_0_env));
    tsc_thread_t _t_0 = tsc_thread_spawn(_spawn_0_fn, _env_0);
    (void)_t_0;
    return 0;
}
