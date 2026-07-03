#include "runtime.h"

typedef struct LinkedList LinkedList;
struct LinkedList { int32_t value; LinkedList * next; };

int main(void) {
    TSC_INIT();
    return 0;
}
