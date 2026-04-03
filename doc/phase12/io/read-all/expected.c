#include "runtime.h"
#include "std/io.h"

typedef struct { uint8_t *data; size_t length; size_t capacity; } Array_u8;

typedef struct {
    int32_t _state; int _result; bool _done;
    Array_u8 data;
    TscReadAllAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_read_all_async(tsc_stdin());
            self->_state = 1;
        case 1:
            tsc_read_all_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->data = self->_await_0._result;
            printf("%zu\n", self->data.length);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
