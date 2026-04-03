#include "runtime.h"
#include "std/io.h"

typedef struct { int32_t _state; int _result; bool _done; TscPipeAwaitable _await_0; } run_state;
static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_pipe_async(tsc_stdin(), tsc_stdout());
            self->_state = 1;
        case 1:
            tsc_pipe_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
