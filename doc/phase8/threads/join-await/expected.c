#include "runtime.h"

typedef struct { int32_t x; } _spawn_0_env;

static const int32_t x = 10;

static void *_spawn_0_fn(void *_arg) {
    _spawn_0_env *env = (_spawn_0_env *)_arg;
    printf("%d\n", env->x);
    free(env);
    return NULL;
}

typedef struct {
    int32_t _state; int _result; bool _done;
    tsc_thread_t _t_0;
} run_state;

static void run_poll(run_state *self, int32_t x) {
    switch (self->_state) {
        case 0: {
            _spawn_0_env *_env_0 = malloc(sizeof(_spawn_0_env));
            _env_0->x = x;
            self->_t_0 = tsc_thread_spawn(_spawn_0_fn, _env_0);
            self->_state = 1;
        }
        case 1:
            if (!tsc_thread_done(self->_t_0)) return;
            tsc_thread_join(self->_t_0);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
