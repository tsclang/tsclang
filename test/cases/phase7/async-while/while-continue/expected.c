#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t max; } sumOdd_state;

static void sumOdd_poll(sumOdd_state *self) {
    switch (self->_state) {
        case 0:
            int32_t total = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < self->max)) { goto while_1_end; }
            i = i + 1;
            if (fmod(i, 2) == 0) goto case_1;
            total = total + i;
            self->_state = 1;
            goto case_1;
while_1_end:
            self->_result = total;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
