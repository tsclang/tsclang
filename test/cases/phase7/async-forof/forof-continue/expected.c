#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    Array_i32 arr;
    size_t _forof_idx_0;
} sumPositive_state;

static void sumPositive_poll(sumPositive_state *self) {
    switch (self->_state) {
        case 0:
            int32_t total = 0;
            self->_forof_idx_0 = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(self->_forof_idx_0 < self->arr.length)) { goto forof_1_end; }
            const int32_t x = self->arr.data[self->_forof_idx_0];
            if (x < 0) goto forof_1_cont;
            total = total + x;
forof_1_cont:
            self->_forof_idx_0++;
            if (!(self->_forof_idx_0 < self->arr.length)) { goto forof_1_end; }
            self->_state = 1;
            goto case_1;
forof_1_end:
            self->_result = total;
            goto _cleanup;
        _cleanup:
            tsc_array_free_i32(&self->arr);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
