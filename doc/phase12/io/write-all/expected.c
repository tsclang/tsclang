#include "runtime.h"
#include "std/io.h"

typedef struct { uint8_t *data; size_t length; size_t capacity; } Array_u8;

uint8_t _arr_data_0[] = {72, 105, 10};
static Array_u8 data = {.data = _arr_data_0, .length = 3, .capacity = 3};

typedef struct { int32_t _state; int _result; bool _done; TscWriteAllAwaitable _await_0; } run_state;
static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_write_all_async(tsc_stdout(), data.data, data.length);
            self->_state = 1;
        case 1:
            tsc_write_all_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
