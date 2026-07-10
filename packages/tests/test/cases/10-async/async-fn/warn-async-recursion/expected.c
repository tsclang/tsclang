#include "runtime.h"

typedef struct { int32_t _state; bool _done; int32_t n; } recurse_state;

typedef struct { int32_t _state; bool _done; recurse_state _await_0; } run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (recurse_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            recurse_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            printf("done\n");
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
