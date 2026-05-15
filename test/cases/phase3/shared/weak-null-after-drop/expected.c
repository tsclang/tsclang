#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; String name; } Node;

int main(void) {
    TSC_INIT();
    Node *n = tsc_arc_alloc(sizeof(Node));
    { String _tsc_tmp = STR_LIT("test"); tsc_string_retain(_tsc_tmp); tsc_string_release(n->name); n->name = _tsc_tmp; }
    Node *w = tsc_weak_create(n);
    Node *strong = tsc_weak_upgrade(w);
    if (strong != NULL) {
        printf("%s\n", strong->name.data);
        tsc_arc_release(strong);
    } else {
        printf("none\n");
    }
    tsc_weak_release(w);
    tsc_arc_release(n);
    return 0;
}

