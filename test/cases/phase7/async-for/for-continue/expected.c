#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t max; } sumOddFor_state;

static void sumOddFor_poll(sumOddFor_state *self) {
    switch (self->_state) {
        case 0:
            int32_t total = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < self->max)) { goto for_1_end; }
            if (fmod(i, 2) == 0) goto for_1_cont;
            total = (int32_t)((uint32_t)total + (uint32_t)i);
for_1_cont:
            i = i + 1;
            if (!(i < self->max)) { goto for_1_end; }
            self->_state = 1;
            goto case_1;
for_1_end:
            self->_result = total;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
