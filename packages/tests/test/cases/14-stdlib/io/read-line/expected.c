#include "runtime.h"
#include "std/io.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    String line;
    TscReadLineAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_read_line_async(tsc_stdin());
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_read_line_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->line = self->_await_0._result;
            printf("%s\n", self->line.data);
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->line);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
