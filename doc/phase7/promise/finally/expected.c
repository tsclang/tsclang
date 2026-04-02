#include "runtime.h"

typedef struct { int32_t _state; int _result; bool _done; } work_state;
static void work_poll(work_state *self) {
    switch (self->_state) {
        case 0: printf("working\n"); self->_done = true; return;
    }
}

typedef struct {
    int32_t _state; int _result; bool _done;
    work_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (work_state){0};
            self->_state = 1;
        case 1:
            work_poll(&self->_await_0);
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
